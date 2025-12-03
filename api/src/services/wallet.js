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
async function claimNextWalletIndex(conn, chainId) {
  await conn.query(
    'INSERT INTO wallet_index (chain_id, next_index) VALUES (?, 1) ON DUPLICATE KEY UPDATE next_index=LAST_INSERT_ID(next_index + 1)',
    [chainId]
  );
  const [[row]] = await conn.query('SELECT LAST_INSERT_ID() AS nextIndex');
  if (row?.nextIndex === undefined) {
    throw new Error('Failed to allocate wallet index');
  }
  return Number(row.nextIndex) - 1;
}
async function realignWalletIndex(conn, chainId) {
  const [[row]] = await conn.query(
    'SELECT COALESCE(MAX(derivation_index), 999999) AS maxIndex FROM wallet_addresses WHERE chain_id=?',
    [chainId]
  );
  const nextIndex = Number(row?.maxIndex ?? 999999) + 1;
  await conn.query(
    'INSERT INTO wallet_index (chain_id, next_index) VALUES (?, ?) ON DUPLICATE KEY UPDATE next_index=GREATEST(next_index, VALUES(next_index))',
    [chainId, nextIndex]
  );
  console.log(`Realigned index for chainId ${chainId} to ${nextIndex}`);
  return nextIndex;
}
async function provisionUserAddress(db, userId, chainId = Number(process.env.CHAIN_ID || 56)) {
  const masterMnemonic = getMasterMnemonic();
  const shouldManageConn = !!db.getConnection;
  const conn = shouldManageConn ? await db.getConnection() : db;
  try {
    const [existing] = await conn.query(
      'SELECT chain_id, address, derivation_index FROM wallet_addresses WHERE user_id=? AND chain_id=?',
      [userId, chainId]
    );
    if (existing.length) {
      return { chain_id: existing[0].chain_id, address: existing[0].address };
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      if (shouldManageConn) await conn.beginTransaction();
      try {
        const nextIndex = await claimNextWalletIndex(conn, chainId);
        const offsetIndex = nextIndex + 1000000; // ابدأ من مليون – آمن لـ 1M+ يوزر
        // تغيير: استخدم HDNodeWallet بدل Wallet عشان يطبق الـ path صح
        const hdWallet = ethers.HDNodeWallet.fromPhrase(masterMnemonic, undefined, `m/44'/60'/0'/0/${offsetIndex}`);
        const address = hdWallet.address.toLowerCase();
        
        console.log(`Provision attempt ${attempt}: nextIndex=${nextIndex}, offsetIndex=${offsetIndex}, userId=${userId}`);
        console.log(`Generated address for index ${offsetIndex}: ${address}`);
        
        await conn.query(
          'INSERT INTO wallet_addresses (user_id, chain_id, derivation_index, address) VALUES (?,?,?,?)',
          [userId, chainId, offsetIndex, address] // استخدم offsetIndex في derivation_index
        );
        if (shouldManageConn) await conn.commit();
        return { chain_id: chainId, address };
      } catch (err) {
        if (shouldManageConn) await conn.rollback();
        console.error(`Error on provision attempt ${attempt} for userId ${userId}: ${err.message} (code: ${err.code})`);
        if (err.code === 'ER_DUP_ENTRY') {
          await realignWalletIndex(conn, chainId);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Failed to provision wallet address after multiple attempts');
  } finally {
    if (shouldManageConn) conn.release();
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
