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
  {
    userId,
    chainId,
    depositAddressLc,
    tokenSymbol,
    tokenAddressLc,
    amountTokenDecimalStr,
    status,
  },
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
  const confirmations = Number(process.env.CONFIRMATIONS || 12);
  const statusVal = status === 'swept' ? 'swept' : 'confirmed';
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
        "INSERT INTO wallet_deposits (user_id, chain_id, address, token_symbol, token_address, amount_wei, tx_hash, block_number, block_hash, confirmations, status, credited, source, created_at) VALUES (?,?,?,?,?,?,?, ?, ?, ?, ?, 1, 'sweeper', NOW())",
        [userId, chainId, addrLc, tokenSymbol, tokenAddrLc, amt, '', null, '', confirmations, statusVal],
      );
    }
    console.log(`[POST][CREDIT] user=${userId} addr=${addrLc} sym=${tokenSymbol} amount=${amt} status=${statusVal} tx=''`);
  } catch (e) {
    console.error('[POST][ERR][recordUserDepositNoTx]', e);
  }
}

module.exports = {
  resolveUserId,
  recordUserDepositNoTx,
};

