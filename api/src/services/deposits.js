// Database helpers for wallet deposits

async function upsertDeposit(db, row) {
  const ZERO = '0x0000000000000000000000000000000000000000';
  const address = row.address.toLowerCase();
  const tokenAddress = (row.token_address ? row.token_address : ZERO).toLowerCase();
  const txHash = row.tx_hash && row.tx_hash.trim()
    ? row.tx_hash.toLowerCase()
    : `manual:${row.source || 'unknown'}:${address}:${row.block_number || 0}`;
  const logIndex = row.log_index ?? 0;
  const tokenSymbol = (row.token_symbol || (tokenAddress === ZERO ? 'BNB' : '')).toUpperCase();
  const sql = `INSERT INTO wallet_deposits (user_id, chain_id, address, token_symbol, tx_hash, log_index, block_number, block_hash, token_address, amount_wei, confirmations, status, source, scanner_run_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE block_number=VALUES(block_number), block_hash=VALUES(block_hash), amount_wei=VALUES(amount_wei), confirmations=VALUES(confirmations), status=VALUES(status), source=VALUES(source), scanner_run_id=VALUES(scanner_run_id), last_update_at=CURRENT_TIMESTAMP`;
  const params = [
    row.user_id,
    row.chain_id,
    address,
    tokenSymbol,
    txHash,
    logIndex,
    row.block_number,
    row.block_hash,
    tokenAddress,
    row.amount_wei,
    row.confirmations,
    row.status,
    row.source || 'on_demand',
    row.scanner_run_id,
  ];
  await db.query(sql, params);
}

async function markConfirmed(db, txHash, blockNumber) {
  await db.query(
    'UPDATE wallet_deposits SET status="confirmed", confirmations=?-block_number, last_update_at=NOW() WHERE tx_hash=? AND block_number=?',
    [blockNumber, txHash, blockNumber]
  );
}

async function getConfirmedBalancesForUser(db, userId) {
  const [rows] = await db.query(
    'SELECT token_address, SUM(amount_wei) AS total FROM wallet_deposits WHERE user_id=? AND status="confirmed" GROUP BY token_address',
    [userId]
  );
  return rows;
}

module.exports = { upsertDeposit, markConfirmed, getConfirmedBalancesForUser };
