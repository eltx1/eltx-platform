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

const { ethers } = require('ethers');

async function recordUserDepositNoTx(
  pool,
  {
    userId,
    chainId,
    depositAddressLc,
    tokenSymbol,
    tokenAddressLc,
    amountWeiStr,
    status,
  },
) {
  if (!userId) {
    console.log(`[POST][SKIP] no user for address=${depositAddressLc}`);
    return;
  }
  const ZERO = '0x0000000000000000000000000000000000000000';
  const addrLc = (depositAddressLc || '').toLowerCase();
  const tokenAddrLc = tokenAddressLc ? tokenAddressLc.toLowerCase() : ZERO;

  // normalise amount to wei (string)
  let amtWei = amountWeiStr;
  try {
    if (!amtWei || amtWei.includes('.')) {
      amtWei = tokenAddrLc === ZERO ? ethers.parseEther(String(amountWeiStr)).toString() : BigInt(amountWeiStr).toString();
    } else {
      amtWei = BigInt(amountWeiStr).toString();
    }
  } catch {
    console.log(`[POST][SKIP] user=${userId} addr=${addrLc} invalid_amount=${amountWeiStr}`);
    return;
  }
  if (BigInt(amtWei) <= 0n) {
    console.log(`[POST][SKIP] user=${userId} addr=${addrLc} zero_amount`);
    return;
  }

  const confirmations = Number(process.env.CONFIRMATIONS || 12);
  const statusVal = status === 'swept' ? 'swept' : 'confirmed';
  const txHash = `manual:sweeper:${chainId}:${addrLc}:${tokenAddrLc}:${amtWei}`;
  try {
    await pool.query(
      `INSERT INTO wallet_deposits (user_id, chain_id, address, token_symbol, token_address, amount_wei, tx_hash, log_index, block_number, block_hash, confirmations, status, credited, source, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, ?, 1, 'sweeper', NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status), credited=1, confirmations=VALUES(confirmations), last_update_at=NOW()`,
      [userId, chainId, addrLc, tokenSymbol, tokenAddrLc, amtWei, txHash, 0, null, '', confirmations, statusVal],
    );
    console.log(`[POST][CREDIT] user=${userId} addr=${addrLc} sym=${tokenSymbol} amount=${amtWei} status=${statusVal} tx='${txHash}'`);
  } catch (e) {
    console.error('[POST][ERR][recordUserDepositNoTx]', e);
  }
}

module.exports = {
  resolveUserId,
  recordUserDepositNoTx,
};

