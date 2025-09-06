// Database helpers for wallet deposits

async function upsertDeposit(db, row) {
  const sql = `INSERT INTO wallet_deposits (user_id, chain_id, to_address, tx_hash, block_number, block_hash, token_address, amount_wei, confirmations, status, source, scanner_run_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE block_number=VALUES(block_number), block_hash=VALUES(block_hash), amount_wei=VALUES(amount_wei), confirmations=VALUES(confirmations), status=VALUES(status), source=VALUES(source), scanner_run_id=VALUES(scanner_run_id), last_update_at=CURRENT_TIMESTAMP`;
  const params = [
    row.user_id,
    row.chain_id,
    row.to_address,
    row.tx_hash,
    row.block_number,
    row.block_hash,
    row.token_address,
    row.amount_wei,
    row.confirmations,
    row.status,
    row.source || 'on_demand',
    row.scanner_run_id
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
