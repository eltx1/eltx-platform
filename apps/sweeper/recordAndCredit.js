const { getPool } = require("./db");
const { toWeiString } = require("./lib/units");

const NATIVE_ZERO = "0x0000000000000000000000000000000000000000";

async function recordAndCreditSweep(o) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const tokenAddr = (o.tokenAddress && o.tokenAddress !== "") ? o.tokenAddress : NATIVE_ZERO;
    const asset = (o.assetSymbol || "").toUpperCase();
    const amountWei = toWeiString(o.amount, 18);
    if (amountWei.includes(".")) {
      console.log(`[REC][SKIP] amount_format_error amount=${o.amount}`);
      await conn.rollback();
      return { ok: false };
    }

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
        o.userId, o.chainId, o.address, asset,
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

    const amt = BigInt(d.amount_wei);
    if (
      !d.credited &&
      (d.status === "swept" || d.status === "confirmed") &&
      Number(d.confirmations) >= o.confirmations &&
      amt > 0n &&
      asset
    ) {
      const [balRows] = await conn.query(
        `SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=? FOR UPDATE`,
        [o.userId, asset]
      );
      const before = balRows.length ? BigInt(balRows[0].balance_wei) : 0n;
      await conn.query(
        `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
        [o.userId, asset, d.amount_wei]
      );
      const after = before + amt;

      await conn.query(`UPDATE wallet_deposits SET credited=1, last_update_at=NOW() WHERE id=?`, [d.id]);
      console.log(
        `[CREDIT] depositId=${d.id} userId=${o.userId} asset=${asset} amountWei=${d.amount_wei} status=${d.status} confirmations=${d.confirmations} beforeBalance=${before} afterBalance=${after}`
      );
    } else {
      let reason = "";
      if (d.credited || !(d.status === "swept" || d.status === "confirmed")) reason = "credit_skip:status";
      else if (Number(d.confirmations) < o.confirmations) reason = "credit_skip:conf";
      else if (amt <= 0n) reason = "credit_skip:amount_zero";
      else if (!asset) reason = "credit_skip:asset_missing";
      console.log(
        `[CREDIT][SKIP] reason=${reason} depositId=${d.id} status=${d.status} confirmations=${d.confirmations} credited=${d.credited} amountWei=${d.amount_wei} asset=${asset}`
      );
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
