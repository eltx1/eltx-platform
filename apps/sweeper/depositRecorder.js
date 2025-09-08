async function resolveUserId(pool, { chainId, addressLc }) {
  try {
    const [rows] = await pool.query(
      'SELECT user_id FROM wallet_addresses WHERE chain_id=? AND LOWER(address)=? LIMIT 1',
      [chainId, addressLc],
    );
    return rows[0] ? rows[0].user_id : null;
  } catch (e) {
    console.error('[POST][ERR][resolveUserId]', e);
    return null;
  }
}

async function recordUserDepositNoTx(
  pool,
  { userId, chainId, depositAddressLc, tokenSymbol, tokenAddressLc, amountTokenDecimalStr },
) {
  const amt = amountTokenDecimalStr;
  if (!userId) {
    console.log(`[POST][SKIP] no user for address=${depositAddressLc}`);
    return;
  }
  if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) {
    console.log(`[POST][SKIP] user=${userId} addr=${depositAddressLc} invalid_amount=${amt}`);
    return;
  }
  const addrLc = (depositAddressLc || '').toLowerCase();
  const tokenAddrLc = tokenAddressLc ? tokenAddressLc.toLowerCase() : null;
  const statusVal = 'confirmed';
  const confirmations = Number(process.env.CONFIRMATIONS || 12);
  try {
    const [rows] = await pool.query(
      `SELECT id FROM wallet_deposits WHERE user_id=? AND chain_id=? AND LOWER(address)=? AND ((token_address IS NULL AND ? IS NULL) OR (LOWER(token_address)=?)) AND amount_wei=? AND source='sweeper' AND tx_hash='' AND created_at >= NOW() - INTERVAL 1 DAY LIMIT 1`,
      [userId, chainId, addrLc, tokenAddrLc, tokenAddrLc, amt],
    );
    if (rows[0]) {
      await pool.query(
        'UPDATE wallet_deposits SET status=?, credited=1, confirmations=?, last_update_at=NOW() WHERE id=?',
        [statusVal, confirmations, rows[0].id],
      );
    } else {
      await pool.query(
        'INSERT INTO wallet_deposits (user_id, chain_id, address, token_symbol, token_address, amount_wei, tx_hash, block_number, block_hash, confirmations, status, credited, source, created_at) VALUES (?,?,?,?,?,?,?, ?, ?, ?, ?, 1, \'sweeper\', NOW())',
        [userId, chainId, addrLc, tokenSymbol, tokenAddrLc, amt, '', null, '', confirmations, statusVal],
      );
    }
    console.log(
      `[POST][CREDIT] user=${userId} addr=${addrLc} sym=${tokenSymbol} amount=${amt} status=${statusVal} tx=''`,
    );
  } catch (e) {
    console.error('[POST][ERR][recordUserDepositNoTx]', e);
  }
}

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
module.exports = {
  detectAndUpsertDeposit,
  resolveUserId,
  recordUserDepositNoTx,
};

