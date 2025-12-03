const { getWalletForIndex, getDerivationPath, getMasterMnemonic, logMasterFingerprint } = require('../../../src/utils/hdWallet');

logMasterFingerprint('api-service');
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
    'SELECT GREATEST(COALESCE(MAX(wallet_index), -1), COALESCE(MAX(derivation_index), -1)) AS maxIndex FROM wallet_addresses WHERE chain_id=?',
    [chainId]
  );
  const nextIndex = Number(row?.maxIndex ?? -1) + 1;
  await conn.query(
    'INSERT INTO wallet_index (chain_id, next_index) VALUES (?, ?) ON DUPLICATE KEY UPDATE next_index=GREATEST(next_index, VALUES(next_index))',
    [chainId, nextIndex]
  );
  console.log(`Realigned index for chainId ${chainId} to ${nextIndex}`);
  return nextIndex;
}
async function provisionUserAddress(db, userId, chainId = Number(process.env.CHAIN_ID || 56)) {
  getMasterMnemonic();
  const shouldManageConn = !!db.getConnection;
  const conn = shouldManageConn ? await db.getConnection() : db;
  try {
    const [existing] = await conn.query(
      'SELECT chain_id, address, wallet_index, wallet_path FROM wallet_addresses WHERE user_id=? AND chain_id=?',
      [userId, chainId]
    );
    if (existing.length) {
      return { chain_id: existing[0].chain_id, address: existing[0].address };
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      if (shouldManageConn) await conn.beginTransaction();
      try {
        const walletIndex = await claimNextWalletIndex(conn, chainId);
        const walletPath = getDerivationPath(walletIndex);
        const hdWallet = getWalletForIndex(walletIndex);
        const address = hdWallet.address.toLowerCase();

        console.log(`Provision attempt ${attempt}: walletIndex=${walletIndex}, userId=${userId}`);
        console.log(`Generated address for index ${walletIndex} (path=${walletPath}): ${address}`);

        await conn.query(
          'INSERT INTO wallet_addresses (user_id, chain_id, wallet_index, wallet_path, derivation_index, address) VALUES (?,?,?,?,?,?)',
          [userId, chainId, walletIndex, walletPath, walletIndex, address]
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
