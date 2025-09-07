import { getLatestBlockNumber, getLogs, getBlocksWithTxsBatch, rpcProvider } from './services/bscRpc';
import { TOKENS_IN_SCOPE, TRANSFER_TOPIC } from './services/tokenMaps';
import { upsertDeposit, markConfirmed } from './services/deposits';
import { getAddressProgress, updateAddressProgress } from './services/addressProgress';
import type { Pool } from 'mysql2/promise';
import { ethers } from 'ethers';

const RECENT_WINDOW = 1000;
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);

export async function scanAddress(db: Pool, address: string, userId: number) {
  const addr = address.toLowerCase();
  const chainId = Number(process.env.CHAIN_ID || 56);

  const toBlock = await getLatestBlockNumber();
  const progress = await getAddressProgress(db, addr);
  const last = progress?.last_scanned_block ?? toBlock - RECENT_WINDOW;
  const fromBlock = Math.max(toBlock - RECENT_WINDOW, last + 1);
  if (fromBlock > toBlock) return;

  const providerBalance = await rpcProvider.getBalance(addr);
  const bnbBal = providerBalance.toString();

  // ERC20 logs
  for (const token of TOKENS_IN_SCOPE) {
    if (!token.address) continue;
    const filter = {
      address: token.address,
      fromBlock,
      toBlock,
      topics: [TRANSFER_TOPIC, null, ethers.zeroPadValue(addr, 32)],
    } as any;
    const logs = await getLogs(filter);
    for (const log of logs) {
      const from = ethers.getAddress('0x' + log.topics[1].slice(26));
      const to = ethers.getAddress('0x' + log.topics[2].slice(26));
      const amount = BigInt(log.data).toString();
      const confirmations = toBlock - log.blockNumber + 1;
      const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
      await upsertDeposit(db, {
        user_id: userId,
        chain_id: chainId,
        from_address: from.toLowerCase(),
        to_address: addr,
        token_symbol: token.symbol,
        token_address: token.address,
        amount_wei: amount,
        tx_hash: log.transactionHash,
        block_number: log.blockNumber,
        status,
        confirmations,
        source: 'worker',
      });
      if (status === 'confirmed') {
        await markConfirmed(db, log.transactionHash, log.blockNumber);
      }
    }
  }

  // Native BNB transfers
  const shouldScanBnB = BigInt(bnbBal) > 0n || !progress || !progress.last_scan_at || Date.now() - new Date(progress.last_scan_at).getTime() > 30 * 60 * 1000;
  if (shouldScanBnB) {
    const blocks: number[] = [];
    for (let n = fromBlock; n <= toBlock; n++) blocks.push(n);
    const blockBatches = await getBlocksWithTxsBatch(blocks);
    for (const block of blockBatches) {
      for (const tx of block.transactions) {
        if (tx.to && tx.to.toLowerCase() === addr) {
          const confirmations = toBlock - block.number + 1;
          const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
          await upsertDeposit(db, {
            user_id: userId,
            chain_id: chainId,
            from_address: tx.from.toLowerCase(),
            to_address: addr,
            token_symbol: 'BNB',
            token_address: null,
            amount_wei: tx.value.toString(),
            tx_hash: tx.hash,
            block_number: block.number,
            status,
            confirmations,
            source: 'worker',
          });
          if (status === 'confirmed') await markConfirmed(db, tx.hash, block.number);
        }
      }
    }
  }

  await updateAddressProgress(db, addr, {
    last_scanned_block: toBlock,
    last_seen_balance_wei: bnbBal,
    last_scan_at: new Date(),
    next_eligible_at: new Date(Date.now() + 2 * 60 * 1000),
  });
}
