import { getLogs, getBlocksWithTxsBatch, rpcProvider } from './bscRpc.ts';
import { getScanBounds } from './scanBounds.ts';
import { upsertDeposit, markConfirmed } from './deposits.ts';
import {
  getTokensInScope,
  TRANSFER_TOPIC,
  checksum,
  hexToDec,
  decodeTransfer,
} from './tokens.ts';
import type { TokenInfo } from './tokens.ts';
import { ethers } from 'ethers';

const BATCH_BLOCKS = Number(process.env.WORKER_BATCH_BLOCKS || 50);
const REQUIRED_CONF = Number(process.env.CONFIRMATIONS || 12);
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

export async function scanOneAddress(addr: string, latest: number) {
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

  const { fromBlock, toBlock } = await getScanBounds(addr, latest);
  console.log(`[SCAN] addr=${addr} range=[${fromBlock}..${toBlock}]`);

  // ERC20 tokens with balance
  for (const t of tokensWithBalance) {
    if (t.symbol === 'BNB' || !t.address) continue;
    const paddedTo = '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    let logs: any[] = [];
    try {
      logs = await getLogs({
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: '0x' + toBlock.toString(16),
        address: t.address,
        topics: [TRANSFER_TOPIC, null, paddedTo],
      } as any);
    } catch (e) {
      console.error('[RPC][ERROR]', e?.message || e);
      continue;
    }

    for (const log of logs) {
      const { from, to, amount } = decodeTransfer(log);
      const txHash = log.transactionHash;
      const blockNumber = Number(log.blockNumber);
      const conf = latest - blockNumber + 1;
      const status = conf >= REQUIRED_CONF ? 'confirmed' : 'pending';
      const isNew = await upsertDeposit({
        to_address: checksum(to),
        from_address: checksum(from),
        token_symbol: t.symbol,
        token_address: t.address,
        amount_wei: amount,
        tx_hash: txHash,
        block_number: blockNumber,
        status,
        confirmations: conf,
        source: 'worker',
      });
      if (isNew) console.log(`[SCAN][NEW] ${addr} ${t.symbol} ${txHash} ${amount}`);
      if (status === 'confirmed') await markConfirmed(txHash, blockNumber);
    }
  }

  // Native BNB transfers when balance exists
  if (tokensWithBalance.some((t) => t.symbol === 'BNB')) {
    for (let b = fromBlock; b <= toBlock; b += BATCH_BLOCKS) {
      const end = Math.min(b + BATCH_BLOCKS - 1, toBlock);
      let blocks: any[] = [];
      try {
        blocks = await getBlocksWithTxsBatch(
          Array.from({ length: end - b + 1 }, (_, i) => b + i)
        );
      } catch (e) {
        console.error('[RPC][ERROR]', e?.message || e);
        continue;
      }
      for (const block of blocks as any[]) {
        for (const tx of (block as any).transactions as any[]) {
          if (!tx.to) continue;
          if (tx.to.toLowerCase() !== addr.toLowerCase()) continue;
          const conf = latest - block.number + 1;
          const status = conf >= REQUIRED_CONF ? 'confirmed' : 'pending';
          const amount = hexToDec(tx.value);
          const isNew = await upsertDeposit({
            to_address: checksum(tx.to),
            from_address: checksum(tx.from),
            token_symbol: 'BNB',
            token_address: null,
            amount_wei: amount,
            tx_hash: tx.hash,
            block_number: block.number,
            status,
            confirmations: conf,
            source: 'worker',
          });
          if (isNew) console.log(`[SCAN][NEW] ${addr} BNB ${tx.hash} ${amount}`);
          if (status === 'confirmed') await markConfirmed(tx.hash, block.number);
        }
      }
      await new Promise((r) => setImmediate(r));
    }
  }
}
