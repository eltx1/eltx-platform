const mysql = require('mysql2/promise');
const { ethers } = require('ethers');
require('dotenv').config();

const CHAIN = process.env.CHAIN || 'bsc-mainnet';
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const RPC_HTTP = process.env.RPC_HTTP;
const RPC_WS = process.env.RPC_WS;
const ADDR_REFRESH_MINUTES = Number(process.env.ADDR_REFRESH_MINUTES || 15);

async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  return mysql.createPool(process.env.DATABASE_URL);
}

async function loadActiveAddresses(pool) {
  const [rows] = await pool.query('SELECT address, user_id FROM wallet_addresses WHERE status="active" AND chain=?', [CHAIN]);
  const map = new Map();
  for (const r of rows) map.set(r.address.toLowerCase(), r.user_id);
  return map;
}

async function ensureCursor(pool, provider) {
  const latest = await provider.getBlockNumber();
  const [rows] = await pool.query('SELECT last_block,last_hash FROM chain_cursor WHERE chain=?', [CHAIN]);
  if (!rows.length) {
    const start = latest - 3;
    await pool.query('INSERT INTO chain_cursor (chain,last_block,last_hash) VALUES (?,?,NULL)', [CHAIN, start]);
    return { last_block: start, last_hash: null };
  }
  return rows[0];
}

async function handleBlock(pool, addrMap, block) {
  const [cursor] = await pool.query('SELECT last_block,last_hash FROM chain_cursor WHERE chain=?', [CHAIN]);
  if (cursor.length && cursor[0].last_block === block.number && cursor[0].last_hash && cursor[0].last_hash !== block.hash) {
    await pool.query('UPDATE wallet_deposits SET status="orphaned" WHERE chain=? AND block_number=?', [CHAIN, block.number]);
  }

  for (const tx of block.transactions) {
    const to = tx.to ? tx.to.toLowerCase() : null;
    if (to && addrMap.has(to)) {
      const userId = addrMap.get(to);
      await pool.query(
        'INSERT IGNORE INTO wallet_deposits (user_id, chain, address, tx_hash, block_number, block_hash, token_address, amount_wei, confirmations, status) VALUES (?,?,?,?,?,?,NULL,?,0,\'seen\')',
        [userId, CHAIN, to, tx.hash, block.number, block.hash, tx.value.toString()]
      );
    }
  }

  await pool.query(
    'UPDATE wallet_deposits SET confirmations=?-block_number WHERE chain=? AND status IN (\'seen\',\'confirmed\')',
    [block.number, CHAIN]
  );
  await pool.query(
    'UPDATE wallet_deposits SET status=\'confirmed\' WHERE chain=? AND status=\'seen\' AND confirmations>=?',
    [CHAIN, CONFIRMATIONS]
  );

  const [confirmed] = await pool.query(
    'SELECT id,user_id,amount_wei FROM wallet_deposits WHERE chain=? AND status=\'confirmed\' AND credited=0',
    [CHAIN]
  );
  for (const dep of confirmed) {
    await pool.query(
      'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,\'native\',?) ON DUPLICATE KEY UPDATE balance_wei=balance_wei+VALUES(balance_wei)',
      [dep.user_id, dep.amount_wei]
    );
    await pool.query('UPDATE wallet_deposits SET credited=1 WHERE id=?', [dep.id]);
  }

  await pool.query('UPDATE chain_cursor SET last_block=?, last_hash=? WHERE chain=?', [block.number, block.hash, CHAIN]);
  console.log(`processed block ${block.number}`);
}

async function main() {
  const pool = await initDb();
  const provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
  const wsProvider = RPC_WS ? new ethers.WebSocketProvider(RPC_WS, CHAIN_ID) : null;
  await ensureCursor(pool, provider);
  let addrMap = await loadActiveAddresses(pool);
  setInterval(async () => {
    try {
      addrMap = await loadActiveAddresses(pool);
      console.log('refreshed address list');
    } catch (e) {
      console.error('address refresh failed', e);
    }
  }, ADDR_REFRESH_MINUTES * 60 * 1000);

  const processBlockNumber = async (num) => {
    try {
      const block = await provider.getBlock(num, true);
      if (block) await handleBlock(pool, addrMap, block);
    } catch (e) {
      console.error('block error', e);
    }
  };

  if (wsProvider) {
    wsProvider.on('block', processBlockNumber);
  } else {
    let last = await provider.getBlockNumber();
    setInterval(async () => {
      const latest = await provider.getBlockNumber();
      for (let b = last + 1; b <= latest; b++) {
        await processBlockNumber(b);
      }
      last = latest;
    }, 13000);
  }
}

main().catch((e) => {
  console.error('worker failed', e);
});
