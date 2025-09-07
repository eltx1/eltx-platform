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
import { rpcCall } from './rpc.ts';
import { logger, shortAddr } from './logger.ts';

const BATCH_BLOCKS = Number(process.env.WORKER_BATCH_BLOCKS || 50);
const REQUIRED_CONF = Number(process.env.CONFIRMATIONS || 12);
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

export async function scanOneAddress(addr: string, latest: number, verbose: boolean) {
  const start = Date.now();
  const stats = { new: 0, updated: 0, confirmed: 0, errors: 0 };
  try {
    const tokens = getTokensInScope();
    const tokensWithBalance: TokenInfo[] = [];
    for (const t of tokens) {
      try {
        if (t.symbol === 'BNB') {
          const bal = await rpcProvider.getBalance(addr);
          if (bal > 0n) tokensWithBalance.push(t);
        } else if (t.address) {
          const contract = new ethers.Contract(t.address, ERC20_ABI, rpcProvider);
          const bal: bigint = await contract.balanceOf(addr);
          if (bal > 0n) tokensWithBalance.push(t);
        }
      } catch (e) {
        logger.warn('RPC', 'BAL', `addr=${shortAddr(addr)} token=${t.symbol} err=${e?.message || e}`);
      }
    }
    if (tokensWithBalance.length === 0) {
      return stats;
    }

    const { fromBlock, toBlock } = await getScanBounds(addr, latest);
    if (verbose) {
      logger.info(
        'SCAN',
        'ADDR',
        `${shortAddr(addr)} from=${fromBlock} to=${toBlock} tokens=[${tokensWithBalance
          .map((t) => t.symbol)
          .join(',')}]`
      );
    }

    // ERC20 tokens
    for (const t of tokensWithBalance) {
      if (t.symbol === 'BNB' || !t.address) continue;
      const paddedTo = '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
      let logs: any[] = [];
      let logRes;
      try {
        logRes = await rpcCall('getLogs', () =>
          getLogs({
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
            address: t.address,
            topics: [TRANSFER_TOPIC, null, paddedTo],
          } as any)
        , { token: t.symbol, to: addr });
        logs = logRes.result;
      } catch {
        stats.errors++;
        continue;
      }
      if (verbose || logs.length) {
        logger.info('SCAN', 'ERC20', `token=${t.symbol} addr=${shortAddr(addr)} from=${fromBlock} to=${toBlock} logs=${logs.length} took=${logRes.took}ms`);
      }
      if (logger.isDebug() && logs.length) {
        const ex = logs.slice(0, 3).map((l) => `${l.transactionHash.slice(0,10)}@${Number(l.blockNumber)}`);
        logger.debug('SCAN', 'ERC20', `examples=${ex.join(',')}`);
      }
      for (const log of logs) {
        const { from, to, amount } = decodeTransfer(log);
        const txHash = log.transactionHash;
        const blockNumber = Number(log.blockNumber);
        const conf = latest - blockNumber + 1;
        const status = conf >= REQUIRED_CONF ? 'confirmed' : 'pending';
        const kind = await upsertDeposit({
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
        if (kind === 'new') {
          logger.info('DB', 'NEW', `addr=${shortAddr(addr)} token=${t.symbol} amount=${amount} tx=${txHash} block=${blockNumber} conf=${conf} status=${status}`);
          stats.new++;
        } else if (kind === 'updated') {
          logger.info('DB', 'UPD', `addr=${shortAddr(addr)} token=${t.symbol} tx=${txHash} conf=${conf} status=${status}`);
          stats.updated++;
        } else {
          logger.info('DB', 'DUP', `addr=${shortAddr(addr)} token=${t.symbol} tx=${txHash}`);
        }
        if (status === 'confirmed') {
          const changed = await markConfirmed(txHash, blockNumber);
          if (changed) {
            logger.info('DB', 'CONFIRM', `addr=${shortAddr(addr)} token=${t.symbol} tx=${txHash} block=${blockNumber} conf=${conf}`);
            stats.confirmed++;
          }
        }
      }
    }

    // Native BNB
    if (tokensWithBalance.some((t) => t.symbol === 'BNB')) {
      for (let b = fromBlock; b <= toBlock; b += BATCH_BLOCKS) {
        const end = Math.min(b + BATCH_BLOCKS - 1, toBlock);
        let blocks: any[] = [];
        let batchRes;
        try {
          batchRes = await rpcCall('getBlocksWithTxsBatch', () =>
            getBlocksWithTxsBatch(Array.from({ length: end - b + 1 }, (_, i) => b + i))
          , { addr, range: `[${b}..${end}]` });
          blocks = batchRes.result;
        } catch {
          stats.errors++;
          continue;
        }
        let checked = 0;
        let match = 0;
        const matches: any[] = [];
        for (const block of blocks as any[]) {
          for (const tx of (block as any).transactions as any[]) {
            checked++;
            if (!tx.to) continue;
            if (tx.to.toLowerCase() !== addr.toLowerCase()) continue;
            match++;
            matches.push(tx);
            const conf = latest - block.number + 1;
            const status = conf >= REQUIRED_CONF ? 'confirmed' : 'pending';
            const amount = hexToDec(tx.value);
            const kind = await upsertDeposit({
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
            if (kind === 'new') {
              logger.info('DB', 'NEW', `addr=${shortAddr(addr)} token=BNB amount=${amount} tx=${tx.hash} block=${block.number} conf=${conf} status=${status}`);
              stats.new++;
            } else if (kind === 'updated') {
              logger.info('DB', 'UPD', `addr=${shortAddr(addr)} token=BNB tx=${tx.hash} conf=${conf} status=${status}`);
              stats.updated++;
            } else {
              logger.info('DB', 'DUP', `addr=${shortAddr(addr)} token=BNB tx=${tx.hash}`);
            }
            if (status === 'confirmed') {
              const changed = await markConfirmed(tx.hash, block.number);
              if (changed) {
                logger.info('DB', 'CONFIRM', `addr=${shortAddr(addr)} token=BNB tx=${tx.hash} block=${block.number} conf=${conf}`);
                stats.confirmed++;
              }
            }
          }
        }
        if (verbose || match) {
          logger.info('SCAN', 'BNB', `addr=${shortAddr(addr)} range=[${b}..${end}] blocks=${blocks.length} txsChecked=${checked} match=${match} took=${batchRes.took}ms`);
        }
        if (logger.isDebug() && match) {
          const ex = matches.slice(0, 2).map((tx: any) => `${tx.hash.slice(0,10)}@${tx.blockNumber}`);
          logger.debug('SCAN', 'BNB', `examples=${ex.join(',')}`);
        }
        await new Promise((r) => setImmediate(r));
      }
      await new Promise((r) => setImmediate(r));
    }
  } catch (e) {
    logger.error('SCAN', 'ADDR', `addr=${shortAddr(addr)} err=${e?.message || e}`);
    stats.errors++;
  } finally {
    const took = Date.now() - start;
    logger.info('SUM', 'ADDR', `addr=${shortAddr(addr)} new=${stats.new} updated=${stats.updated} confirmed=${stats.confirmed} errors=${stats.errors} took=${took}ms`);
  }
  return stats;
}
