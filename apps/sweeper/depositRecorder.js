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
  const ZERO = '0x0000000000000000000000000000000000000000';
  const addrLc = (depositAddressLc || '').toLowerCase();
  const tokenAddrLc = tokenAddressLc ? tokenAddressLc.toLowerCase() : ZERO;
  const confirmations = Number(process.env.CONFIRMATIONS || 12);
  const statusVal = status === 'swept' ? 'swept' : 'confirmed';
  const txHash = `manual:sweeper:${chainId}:${addrLc}:${tokenAddrLc}:${amt}`;
  try {
    await pool.query(
      `INSERT INTO wallet_deposits (user_id, chain_id, address, token_symbol, token_address, amount_wei, tx_hash, log_index, block_number, block_hash, confirmations, status, credited, source, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, ?, 1, 'sweeper', NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status), credited=1, confirmations=VALUES(confirmations), last_update_at=NOW()`,
      [userId, chainId, addrLc, tokenSymbol, tokenAddrLc, amt, txHash, 0, null, '', confirmations, statusVal],
    );
    console.log(`[POST][CREDIT] user=${userId} addr=${addrLc} sym=${tokenSymbol} amount=${amt} status=${statusVal} tx='${txHash}'`);
  } catch (e) {
    console.error('[POST][ERR][recordUserDepositNoTx]', e);
  }
}

module.exports = {
  resolveUserId,
  recordUserDepositNoTx,
};

