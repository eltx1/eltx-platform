const { ethers } = require('ethers');

async function provisionUserAddress(db, userId, chain = 'bsc-mainnet') {
  if (!process.env.MASTER_MNEMONIC) {
    throw new Error('MASTER_MNEMONIC not set');
  }
  const isConn = !db.getConnection; // if passed connection
  const conn = isConn ? db : await db.getConnection();
  try {
    const [existing] = await conn.query(
      'SELECT chain, address, derivation_index FROM wallet_addresses WHERE user_id=? AND chain=?',
      [userId, chain]
    );
    if (existing.length) {
      if (!isConn) conn.release();
      return existing[0];
    }
    if (!isConn) await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT last_index FROM wallet_index WHERE chain=? FOR UPDATE',
      [chain]
    );
    const nextIndex = rows[0].last_index + 1;
    await conn.query('UPDATE wallet_index SET last_index=? WHERE chain=?', [nextIndex, chain]);
    const wallet = ethers.Wallet.fromPhrase(
      process.env.MASTER_MNEMONIC,
      `m/44'/60'/0'/0/${nextIndex}`
    );
    const address = wallet.address.toLowerCase();
    await conn.query(
      'INSERT INTO wallet_addresses (user_id, chain, derivation_index, address) VALUES (?,?,?,?)',
      [userId, chain, nextIndex, address]
    );
    if (!isConn) await conn.commit();
    return { chain, address, derivation_index: nextIndex };
  } catch (err) {
    if (!isConn) await conn.rollback();
    throw err;
  } finally {
    if (!isConn) conn.release();
  }
}

async function getUserBalance(db, userId, asset = 'native') {
  const [rows] = await db.query(
    'SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=?',
    [userId, asset]
  );
  return rows.length ? rows[0].balance_wei : '0';
}

module.exports = { provisionUserAddress, getUserBalance };
