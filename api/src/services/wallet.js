const { ethers } = require('ethers');

async function provisionUserAddress(db, userId, chainId = Number(process.env.CHAIN_ID || 56)) {
  if (!process.env.MASTER_MNEMONIC) {
    throw new Error('MASTER_MNEMONIC not set');
  }
  const isConn = !db.getConnection; // if passed connection
  const conn = isConn ? db : await db.getConnection();
  try {
    const [existing] = await conn.query(
      'SELECT chain_id, address, derivation_index FROM wallet_addresses WHERE user_id=? AND chain_id=?',
      [userId, chainId]
    );
    if (existing.length) {
      if (!isConn) conn.release();
      return { chain_id: existing[0].chain_id, address: existing[0].address };
    }
    if (!isConn) await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT next_index FROM wallet_index WHERE chain_id=? FOR UPDATE',
      [chainId]
    );
    const nextIndex = rows[0].next_index;
    await conn.query('UPDATE wallet_index SET next_index=? WHERE chain_id=?', [nextIndex + 1, chainId]);
    const wallet = ethers.Wallet.fromPhrase(
      process.env.MASTER_MNEMONIC,
      `m/44'/60'/0'/0/${nextIndex}`
    );
    const address = wallet.address.toLowerCase();
    await conn.query(
      'INSERT INTO wallet_addresses (user_id, chain_id, derivation_index, address) VALUES (?,?,?,?)',
      [userId, chainId, nextIndex, address]
    );
    if (!isConn) await conn.commit();
    return { chain_id: chainId, address };
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
