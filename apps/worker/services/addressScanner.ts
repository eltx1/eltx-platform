import {
  getLatestBlockNumber,
  getLogs,
  getBlocksWithTxsBatch,
  rpcProvider,
} from './bscRpc.ts';
import { getFromBlockForAddress } from './scanBounds.ts';
import { upsertDeposit, markConfirmed } from './deposits.ts';
import {
  getTokensInScope,
  TRANSFER_TOPIC,
  checksum,
  hexToDec,
  TokenInfo,
} from './tokens.ts';
import { ethers } from 'ethers';

const BATCH_BLOCKS = Number(process.env.WORKER_BATCH_BLOCKS || 50);
const REQUIRED_CONF = Number(process.env.CONFIRMATIONS || 12);
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

export async function scanOneAddress(addr: string) {
  const tokens = getTokensInScope();
  const tokensWithBalance: TokenInfo[] = [];

  for (const t of tokens) {
    if (t.symbol === 'BNB') {
      const bal = await rpcProvider.getBalance(addr);
      if (bal > 0n) tokensWithBalance.push(t);
    } else if (t.address) {
      const contract = new ethers.Contract(t.address, ERC20_ABI, rpcProvider);
      const bal: bigint = await contract.balanceOf(addr);
      if (bal > 0n) tokensWithBalance.push(t);
    }
  }

  if (tokensWithBalance.length === 0) return;

  const latest = await getLatestBlockNumber();
  const fromBlock = await getFromBlockForAddress(addr, latest);
  const toBlock = latest;

  // ERC20 tokens with balance
  for (const t of tokensWithBalance) {
    if (t.symbol === 'BNB' || !t.address) continue;
    const paddedTo = '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const logs = await getLogs({
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + toBlock.toString(16),
      address: t.address,
      topics: [TRANSFER_TOPIC, null, paddedTo],
    } as any);

    for (const log of logs) {
      const txHash = log.transactionHash;
      const blockNumber = Number(log.blockNumber);
      const from = '0x' + log.topics[1].slice(26);
      const to = '0x' + log.topics[2].slice(26);
      const amountWei = hexToDec(log.data);
      const conf = latest - blockNumber + 1;
      const status = conf >= REQUIRED_CONF ? 'confirmed' : 'pending';
      await upsertDeposit({
        to_address: checksum(to),
        from_address: checksum(from),
        token_symbol: t.symbol,
        token_address: t.address,
        amount_wei: amountWei,
        tx_hash: txHash,
        block_number: blockNumber,
        status,
        confirmations: conf,
        source: 'worker',
      });
      if (status === 'confirmed') await markConfirmed(txHash, blockNumber);
    }
  }

  // Native BNB transfers when balance exists
  if (tokensWithBalance.some((t) => t.symbol === 'BNB')) {
    for (let b = fromBlock; b <= toBlock; b += BATCH_BLOCKS) {
      const end = Math.min(b + BATCH_BLOCKS - 1, toBlock);
      const blocks = await getBlocksWithTxsBatch(
        Array.from({ length: end - b + 1 }, (_, i) => b + i)
      );
      for (const block of blocks as any[]) {
        for (const tx of (block as any).transactions as any[]) {
          if (!tx.to) continue;
          if (tx.to.toLowerCase() !== addr.toLowerCase()) continue;
          const conf = latest - block.number + 1;
          const status = conf >= REQUIRED_CONF ? 'confirmed' : 'pending';
          await upsertDeposit({
            to_address: checksum(tx.to),
            from_address: checksum(tx.from),
            token_symbol: 'BNB',
            token_address: null,
            amount_wei: hexToDec(tx.value),
            tx_hash: tx.hash,
            block_number: block.number,
            status,
            confirmations: conf,
            source: 'worker',
          });
          if (status === 'confirmed') await markConfirmed(tx.hash, block.number);
        }
      }
      await new Promise((r) => setImmediate(r));
    }
  }
}
