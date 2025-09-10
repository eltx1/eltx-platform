const { getPool } = require('./db');
const { createHash } = require('crypto');

const NATIVE_ZERO = '0x0000000000000000000000000000000000000000';

async function preRecordSweep(o) {
  const pool = await getPool();
  const tokenAddr = (o.tokenAddress && o.tokenAddress !== '') ? o.tokenAddress.toLowerCase() : NATIVE_ZERO;
  const asset = (o.assetSymbol || (tokenAddr === NATIVE_ZERO ? 'BNB' : '')).toUpperCase();
  const key = createHash('sha256').update(`${o.address.toLowerCase()}|${tokenAddr}|${o.amountWei}`).digest('hex');
  const txHash = `pre:${key}`;
  console.log(
    JSON.stringify({ tag: 'SWP:DEPOSIT:PRE_RECORD:BEGIN', user_id: o.userId, asset, amount_wei: o.amountWei, key })
  );
  try {
    let id;
    let reused = false;
    const [rows] = await pool.query(
      `SELECT id FROM wallet_deposits WHERE chain_id=? AND address=? AND token_address_norm=LOWER(?) AND amount_wei=? AND status IN ('pre_sweep','send_error','wait_error') LIMIT 1`,
      [o.chainId, o.address, tokenAddr, o.amountWei]
    );
    if (rows.length) {
      id = rows[0].id;
      reused = true;
      await pool.query(
        `UPDATE wallet_deposits SET token_symbol=?, tx_hash=?, status='pre_sweep', confirmations=0, last_update_at=NOW() WHERE id=?`,
        [asset, txHash, id]
      );
    } else {
      const sql = `INSERT INTO wallet_deposits
           (user_id, chain_id, address, token_symbol, tx_hash, log_index, block_number, block_hash,
            token_address, amount_wei, confirmations, status, credited, source, token_address_norm, created_at, last_update_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, '', ?, ?, 0, 'pre_sweep', 0, 'sweeper', LOWER(?), NOW(), NOW())`;
      const [res] = await pool.query(sql, [o.userId, o.chainId, o.address, asset, txHash, tokenAddr, o.amountWei, tokenAddr]);
      id = res.insertId;
    }
    console.log(
      JSON.stringify({
        tag: 'SWP:DEPOSIT:PRE_RECORD:OK',
        user_id: o.userId,
        asset,
        tx_hash: txHash,
        amount_wei: o.amountWei,
        reused,
        key,
      })
    );
    return { id, txHash, asset, tokenAddr, key };
  } catch (e) {
    console.log(JSON.stringify({ tag: 'SWP:DEPOSIT:PRE_RECORD:ERR', err: e.message }));
    throw e;
  }
}

async function finalizeSweep(o) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  const dayBucket = Math.floor(Date.now() / 86400000);
  const intentId = createHash('sha256')
    .update(`${o.address.toLowerCase()}|${o.tokenAddr}|${o.amountWei}|${dayBucket}`)
    .digest('hex');
  console.log(
    JSON.stringify({ tag: 'SWP:DEPOSIT:UPSERT:BEGIN', id: o.id, status: o.status, tx_hash: o.finalTxHash })
  );
  try {
    await conn.beginTransaction();
    try {
      await conn.query(
        `UPDATE wallet_deposits SET tx_hash=?, status=?, confirmations=?, last_update_at=NOW() WHERE id=?`,
        [o.finalTxHash, o.status, o.confirmations || 0, o.id]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        console.log(
          JSON.stringify({
            tag: 'SWP:DEPOSIT:UPSERT:BEGIN',
            id: o.id,
            status: o.status,
            tx_hash: o.finalTxHash,
            dup: true,
          })
        );
        const [rows] = await conn.query(
          `SELECT id FROM wallet_deposits WHERE chain_id=? AND address=? AND token_address_norm=? AND tx_hash=? AND log_index=0`,
          [o.chainId, o.address, o.tokenAddr, o.finalTxHash]
        );
        if (rows.length) {
          o.id = rows[0].id;
          await conn.query(
            `UPDATE wallet_deposits SET status=?, confirmations=?, last_update_at=NOW() WHERE id=?`,
            [o.status, o.confirmations || 0, o.id]
          );
        }
      } else {
        console.log(JSON.stringify({ tag: 'SWP:DEPOSIT:UPSERT:ERR', err: e.message }));
        throw e;
      }
    }
    console.log(JSON.stringify({ tag: 'SWP:DEPOSIT:UPSERT:OK', id: o.id, status: o.status }));
    console.log(JSON.stringify({ tag: 'SWP:CREDIT:BEGIN', forced: o.forced || false }));
    const [rows2] = await conn.query(`SELECT credited, amount_wei FROM wallet_deposits WHERE id=? FOR UPDATE`, [o.id]);
    if (!rows2.length) throw new Error('deposit_missing');
    const start = new Date(dayBucket * 86400000);
    const end = new Date(start.getTime() + 86400000);
    const [dupRows] = await conn.query(
      `SELECT id FROM wallet_deposits WHERE chain_id=? AND address=? AND token_address_norm=? AND amount_wei=? AND credited=1 AND created_at BETWEEN ? AND ? LIMIT 1`,
      [o.chainId, o.address, o.tokenAddr, rows2[0].amount_wei, start, end]
    );
    if (dupRows.length && dupRows[0].id !== o.id) {
      await conn.query(`UPDATE wallet_deposits SET credited=1, last_update_at=NOW() WHERE id=?`, [o.id]);
      console.log(JSON.stringify({ tag: 'SWP:IDEMPOTENT:SKIP', intent_id: intentId }));
    } else if (!rows2[0].credited && BigInt(o.amountWei) > 0n) {
      const [balRows] = await conn.query(`SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=? FOR UPDATE`, [o.userId, o.asset]);
      const before = balRows.length ? BigInt(balRows[0].balance_wei) : 0n;
      await conn.query(
        `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
        [o.userId, o.asset, o.amountWei]
      );
      const after = before + BigInt(o.amountWei);
      await conn.query(`UPDATE wallet_deposits SET credited=1, last_update_at=NOW() WHERE id=?`, [o.id]);
      console.log(
        JSON.stringify({
          tag: 'SWP:CREDIT:OK',
          before: before.toString(),
          addInteger: o.amountWei,
          after: after.toString(),
          forced: o.forced || false,
          reason: o.error,
        })
      );
    } else {
      console.log(JSON.stringify({ tag: 'SWP:CREDIT:SKIP', credited: rows2[0].credited }));
    }
    await conn.commit();
    console.log(JSON.stringify({ tag: 'SWP:DONE', user_id: o.userId, asset: o.asset, tx_hash: o.finalTxHash, status: o.status, credited: 1 }));
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.log(JSON.stringify({ tag: 'SWP:CREDIT:ERR', err: e.message }));
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { preRecordSweep, finalizeSweep };
