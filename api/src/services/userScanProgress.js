// Track last scanned block per user

async function getLastScannedBlock(db, userId) {
  const [rows] = await db.query('SELECT last_scanned_block FROM user_scan_progress WHERE user_id=?', [userId]);
  return rows.length ? rows[0].last_scanned_block : null;
}

async function updateLastScannedBlock(db, userId, blockNumber) {
  await db.query(
    'INSERT INTO user_scan_progress (user_id, last_scanned_block) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_scanned_block=VALUES(last_scanned_block)',
    [userId, blockNumber]
  );
}

module.exports = { getLastScannedBlock, updateLastScannedBlock };
