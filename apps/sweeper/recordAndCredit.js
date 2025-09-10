const { getPool } = require("./db");
const { toWeiString } = require("./lib/units");

const NATIVE_ZERO = "0x0000000000000000000000000000000000000000";

async function recordAndCreditSweep(o) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const tokenAddr = (o.tokenAddress && o.tokenAddress !== "") ? o.tokenAddress : NATIVE_ZERO;
    const amountWei = toWeiString(o.amount, 18);

    await conn.query(
      `INSERT INTO wallet_deposits
       (user_id, chain_id, address, token_symbol, tx_hash, log_index, block_number, block_hash,
        token_address, amount_wei, confirmations, status, created_at, credited, token_address_norm, source, last_update_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'swept', NOW(), 0, LOWER(?), 'sweeper', NOW())
       ON DUPLICATE KEY UPDATE
         confirmations = GREATEST(confirmations, VALUES(confirmations)),
         status = VALUES(status),
         block_number = COALESCE(VALUES(block_number), block_number),
         block_hash = COALESCE(VALUES(block_hash), block_hash),
         last_update_at = NOW()`,
      [
        o.userId, o.chainId, o.address, o.assetSymbol,
        o.sweepTxHash,
        o.blockNumber ?? null, o.blockHash ?? null,
        tokenAddr, amountWei,
        o.confirmations,
        tokenAddr
      ]
    );

    const [rows] = await conn.query(
      `SELECT id, credited, status, confirmations, amount_wei, token_symbol
       FROM wallet_deposits
       WHERE tx_hash=? AND address=? AND token_address_norm=LOWER(?) FOR UPDATE`,
      [o.sweepTxHash, o.address, tokenAddr]
    );
    if (!rows.length) throw new Error("deposit_row_missing");
    const d = rows[0];

    if (!d.credited && (d.status === 'swept' || d.status === 'confirmed') && Number(d.confirmations) >= o.confirmations) {
      await conn.query(
        `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
        [o.userId, o.assetSymbol, d.amount_wei]
      );

      await conn.query(`UPDATE wallet_deposits SET credited=1, last_update_at=NOW() WHERE id=?`, [d.id]);
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { recordAndCreditSweep };
