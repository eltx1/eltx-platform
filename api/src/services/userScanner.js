const { getLogs, getBlocksWithTxsBatch } = require('./bscRpc');
const { tokenMap, TRANSFER_TOPIC } = require('./tokenMaps');
const { upsertDeposit, markConfirmed } = require('./deposits');
const { decodeTransferLog } = require('./shared/erc20');

module.exports = function createUserScanner(db) {
  const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
  const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);

  async function getUserAddresses(userId) {
    const [rows] = await db.query('SELECT address FROM wallet_addresses WHERE user_id=?', [userId]);
    if (rows.length) return rows.map((r) => r.address.toLowerCase());
    const [[u]] = await db.query('SELECT wallet_address FROM users WHERE id=?', [userId]);
    return u && u.wallet_address ? [u.wallet_address.toLowerCase()] : [];
  }

  async function scanRangeForUser({ userId, fromBlock, toBlock, runId }) {
    const addresses = await getUserAddresses(userId);
    if (!addresses.length) return;
    const addrSet = new Set(addresses.map((a) => a.toLowerCase()));
    console.log(`[scanner] user=${userId} range=${fromBlock}-${toBlock} addrs=${addresses.length}`);
    // Scan ERC20 transfers
    for (const t of Object.values(tokenMap)) {
      if (!t.address) continue;
      for (const addr of addrSet) {
        const logs = await getLogs({
          address: t.address,
          fromBlock,
          toBlock,
          topics: [TRANSFER_TOPIC, null, '0x' + addr.slice(2).padStart(64, '0')]
        });
        for (const log of logs) {
          const { to, value } = decodeTransferLog(log);
          if (to !== addr) continue;
          const confirmations = toBlock - log.blockNumber + 1;
          const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
          await upsertDeposit(db, {
              user_id: userId,
              chain_id: CHAIN_ID,
              address: addr,
              token_symbol: t.symbol,
              tx_hash: log.transactionHash,
              block_number: log.blockNumber,
              block_hash: log.blockHash,
              token_address: t.address,
              amount_wei: value.toString(),
              confirmations,
              status,
              source: 'on_demand',
              scanner_run_id: runId,
            });
          if (status === 'confirmed') await markConfirmed(db, log.transactionHash, log.blockNumber);
        }
      }
    }
    // Native BNB deposits
    const blockNums = [];
    for (let n = fromBlock; n <= toBlock; n++) blockNums.push(n);
    const blocks = await getBlocksWithTxsBatch(blockNums);
    for (const block of blocks) {
      for (const tx of block.transactions || []) {
        const to = tx.to ? tx.to.toLowerCase() : null;
        if (!to || !addrSet.has(to)) continue;
        const value = tx.value || 0n;
        const confirmations = toBlock - block.number + 1;
        const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
        await upsertDeposit(db, {
          user_id: userId,
          chain_id: CHAIN_ID,
          address: to,
          token_symbol: 'BNB',
          tx_hash: tx.hash,
          block_number: block.number,
          block_hash: block.hash,
          token_address: null,
          amount_wei: value.toString(),
          confirmations,
          status,
          source: 'on_demand',
          scanner_run_id: runId,
        });
        if (status === 'confirmed') await markConfirmed(db, tx.hash, block.number);
      }
    }
    console.log(`[scanner] completed user=${userId} range=${fromBlock}-${toBlock}`);
  }

  return { scanRangeForUser };
};
