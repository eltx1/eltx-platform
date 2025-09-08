const crypto = require('crypto');

async function detectAndUpsertDeposit(ctx, pool) {
  const start = Date.now();
  const {
    chainId,
    address,
    tokenAddress,
    amountWei,
    txHash,
    blockNumber,
    nowTs,
    status = 'pending',
    credited = 0,
  } = ctx;
  const addr = (address || '').toLowerCase();
  const tokenAddr = tokenAddress ? tokenAddress.toLowerCase() : null;
  const amountStr = BigInt(amountWei || 0).toString();
  const ts = typeof nowTs === 'number' ? nowTs : Date.now();
  const statusVal = ['pending', 'swept', 'confirmed'].includes(status)
    ? status
    : 'pending';
  const creditedVal = Number(credited) === 1 ? 1 : 0;
  let userId;
  try {
    const [uRows] = await pool.query(
      'SELECT user_id FROM wallet_addresses WHERE chain_id=? AND address=? LIMIT 1',
      [chainId, addr],
    );
    if (!uRows[0]) {
      console.warn(
        `[DEPOSIT][UPSERT] user=null addr=${addr} token=${tokenAddr || 'BNB'} wei=${amountStr} tx=${txHash || 'pending'} action=skip-no-user`,
      );
      return;
    }
    userId = uRows[0].user_id;
  } catch (e) {
    console.error('[DEPOSIT][ERR] select_user', e);
    return;
  }

  let action = 'insert';
  try {
    if (txHash) {
      const tx = txHash.toLowerCase();
      const [rows] = await pool.query('SELECT id FROM wallet_deposits WHERE tx_hash=? LIMIT 1', [tx]);
      if (rows[0]) {
        await pool.query(
          'UPDATE wallet_deposits SET block_number=?, confirmations=0, status=?, credited=?, created_at=FROM_UNIXTIME(?/1000) WHERE id=?',
          [blockNumber ?? 0, statusVal, creditedVal, ts, rows[0].id],
        );
        action = 'update';
      } else {
        const amt = BigInt(amountStr);
        const min = (amt * 99n) / 100n;
        const max = (amt * 101n) / 100n;
        const [pRows] = await pool.query(
          `SELECT id FROM wallet_deposits WHERE user_id=? AND chain_id=? AND address=? AND (token_address <=> ?) AND tx_hash LIKE 'pending:%' AND created_at > DATE_SUB(FROM_UNIXTIME(?/1000), INTERVAL 1 DAY) AND amount_wei BETWEEN ? AND ? ORDER BY id DESC LIMIT 1`,
          [
            userId,
            chainId,
            addr,
            tokenAddr,
            ts,
            min.toString(),
            max.toString(),
          ],
        );
        if (pRows[0]) {
          await pool.query(
            'UPDATE wallet_deposits SET tx_hash=?, block_number=?, confirmations=0, status=?, credited=?, created_at=FROM_UNIXTIME(?/1000) WHERE id=?',
            [tx, blockNumber ?? 0, statusVal, creditedVal, ts, pRows[0].id],
          );
          action = 'update';
        } else {
          await pool.query(
            `INSERT INTO wallet_deposits (user_id, chain_id, address, token_address, amount_wei, tx_hash, block_number, confirmations, status, credited, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,FROM_UNIXTIME(?/1000))`,
            [
              userId,
              chainId,
              addr,
              tokenAddr,
              amountStr,
              tx,
              blockNumber ?? 0,
              0,
              statusVal,
              creditedVal,
              ts,
            ],
          );
          action = 'insert';
        }
      }
    } else {
      const amt = BigInt(amountStr);
      if (amt <= 0n) {
        console.log(`[DEPOSIT][UPSERT] user=${userId} addr=${addr} token=${tokenAddr || 'BNB'} wei=${amountStr} tx=pending action=skip-zero`);
        return;
      }
      const min = (amt * 99n) / 100n;
      const max = (amt * 101n) / 100n;
      const [rows] = await pool.query(
        `SELECT id FROM wallet_deposits WHERE user_id=? AND chain_id=? AND address=? AND (token_address <=> ?) AND status IN ('pending','swept','confirmed') AND created_at > DATE_SUB(FROM_UNIXTIME(?/1000), INTERVAL 1 DAY) AND amount_wei BETWEEN ? AND ? ORDER BY id DESC LIMIT 1`,
        [
          userId,
          chainId,
          addr,
          tokenAddr,
          ts,
          min.toString(),
          max.toString(),
        ],
      );
      if (rows[0]) {
        await pool.query('UPDATE wallet_deposits SET created_at=FROM_UNIXTIME(?/1000) WHERE id=?', [ts, rows[0].id]);
        action = 'update';
      } else {
        const placeholder = `pending:${addr}:${ts}`.slice(0, 80);
        await pool.query(
          `INSERT INTO wallet_deposits (user_id, chain_id, address, token_address, amount_wei, tx_hash, block_number, confirmations, status, credited, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,FROM_UNIXTIME(?/1000))`,
          [
            userId,
            chainId,
            addr,
            tokenAddr,
            amountStr,
            placeholder,
            0,
            0,
            statusVal,
            creditedVal,
            ts,
          ],
        );
        action = 'insert';
      }
    }
  } catch (e) {
    console.error('[DEPOSIT][ERR][UPSERT]', e);
    return;
  } finally {
    console.log(
      `[DEPOSIT][UPSERT] user=${userId} addr=${addr} token=${tokenAddr || 'BNB'} wei=${amountStr} tx=${txHash || 'pending'} action=${action}`,
    );
    console.log(`[DEPOSIT][DONE] took=${Date.now() - start}ms`);
  }
}

async function recordSweepFailure(ctx, pool) {
  const start = Date.now();
  const {
    chainId,
    userId,
    depositAddress,
    tokenAddress,
    amountWei,
    failReason,
    status = 'pending',
    credited = 0,
  } = ctx;
  const addr = (depositAddress || '').toLowerCase();
  const tokenAddr = tokenAddress ? tokenAddress.toLowerCase() : null;
  const amountStr = BigInt(amountWei || 0).toString();
  const statusVal = ['pending', 'swept', 'confirmed'].includes(status)
    ? status
    : 'pending';
  const creditedVal = Number(credited) === 1 ? 1 : 0;
  if (!userId || BigInt(amountStr) <= 0n) {
    console.log(`[DEPOSIT][FAIL] skip user=${userId} amount=${amountStr}`);
    return;
  }
  const hashInput = `${userId}|${addr}|${tokenAddr || 'BNB'}`;
  const failHash =
    'sweeper_fail:' + crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 64);
  try {
    await pool.query(
      `INSERT INTO wallet_deposits (user_id, chain_id, address, token_address, amount_wei, tx_hash, block_number, confirmations, status, credited, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE created_at=VALUES(created_at)`,
      [
        userId,
        chainId,
        addr,
        tokenAddr,
        amountStr,
        failHash,
        0,
        0,
        statusVal,
        creditedVal,
      ],
    );
    console.log(
      `[DEPOSIT][FAIL] user=${userId} addr=${addr} token=${tokenAddr || 'BNB'} wei=${amountStr} reason=${failReason}`,
    );
  } catch (e) {
    console.error('[DEPOSIT][ERR][FAIL]', e);
  } finally {
    console.log(`[DEPOSIT][FAIL] done in ${Date.now() - start}ms`);
  }
}

module.exports = {
  detectAndUpsertDeposit,
  recordSweepFailure,
};

