const { ethers } = require('ethers');

const MASTER_MNEMONIC = (process.env.MASTER_MNEMONIC || '').trim();

function getMasterMnemonic() {
  if (!MASTER_MNEMONIC) {
    const err = new Error('MASTER_MNEMONIC not set');
    err.code = 'MASTER_MNEMONIC_MISSING';
    throw err;
  }
  if (!ethers.Mnemonic.isValidMnemonic(MASTER_MNEMONIC)) {
    const err = new Error('MASTER_MNEMONIC is invalid; replace it with a valid BIP-39 phrase');
    err.code = 'MASTER_MNEMONIC_INVALID';
    throw err;
  }
  return MASTER_MNEMONIC;
}

async function provisionUserAddress(db, userId, chainId = Number(process.env.CHAIN_ID || 56)) {
  const masterMnemonic = getMasterMnemonic();
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
    while (true) {
      const [rows] = await conn.query(
        'SELECT next_index FROM wallet_index WHERE chain_id=? FOR UPDATE',
        [chainId]
      );
      const nextIndex = rows[0].next_index;
      await conn.query('UPDATE wallet_index SET next_index=? WHERE chain_id=?', [nextIndex + 1, chainId]);
      const wallet = ethers.Wallet.fromPhrase(masterMnemonic, `m/44'/60'/0'/0/${nextIndex}`);
      const address = wallet.address.toLowerCase();
      try {
        await conn.query(
          'INSERT INTO wallet_addresses (user_id, chain_id, derivation_index, address) VALUES (?,?,?,?)',
          [userId, chainId, nextIndex, address]
        );
        if (!isConn) await conn.commit();
        return { chain_id: chainId, address };
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          const [existing2] = await conn.query(
            'SELECT chain_id, address FROM wallet_addresses WHERE user_id=? AND chain_id=?',
            [userId, chainId]
          );
          if (existing2.length) {
            if (!isConn) await conn.commit();
            return { chain_id: existing2[0].chain_id, address: existing2[0].address };
          }
          // address belongs to another user, try again with next index
          continue;
        }
        if (!isConn) await conn.rollback();
        throw err;
      }
    }
  } catch (err) {
    if (!isConn) await conn.rollback();
    throw err;
  } finally {
    if (!isConn) conn.release();
  }
}

async function getUserBalance(db, userId, asset = 'BNB') {
  const [rows] = await db.query(
    'SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=?',
    [userId, asset]
  );
  if (!rows.length) return '0';
  const raw = rows[0].balance_wei?.toString() || '0';
  return raw.includes('.') ? raw.split('.')[0] : raw;
}

module.exports = { provisionUserAddress, getUserBalance };
