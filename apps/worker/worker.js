const mysql = require('mysql2/promise');
const { ethers } = require('ethers');
require('dotenv').config();

const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const RPC_HTTP = process.env.BSC_RPC_URL || process.env.RPC_HTTP;
const RPC_WS = process.env.RPC_WS;
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS || 15000);
const BACKFILL_BLOCKS = Number(process.env.BACKFILL_BLOCKS || 5000);
const ADDR_REFRESH_MINUTES = Number(process.env.ADDR_REFRESH_MINUTES || 10);

async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  return mysql.createPool(process.env.DATABASE_URL);
}

async function loadActiveAddresses(pool) {
  const [rows] = await pool.query('SELECT address, user_id FROM wallet_addresses WHERE chain_id=?', [CHAIN_ID]);
  const map = new Map();
  for (const r of rows) map.set(r.address.toLowerCase(), r.user_id);
  return map;
}

async function ensureCursor(pool, provider) {
  const latest = await provider.getBlockNumber();
  const [rows] = await pool.query('SELECT last_block,last_hash FROM chain_cursor WHERE chain_id=?', [CHAIN_ID]);
  if (!rows.length) {
    const start = latest - 3;
    await pool.query('INSERT INTO chain_cursor (chain_id,last_block,last_hash) VALUES (?,?,NULL)', [CHAIN_ID, start]);
    return { last_block: start, last_hash: null };
  }
  return rows[0];
}

async function handleBlock(pool, addrMap, block) {
  const [cursor] = await pool.query('SELECT last_block,last_hash FROM chain_cursor WHERE chain_id=?', [CHAIN_ID]);
  if (cursor.length && cursor[0].last_block === block.number && cursor[0].last_hash && cursor[0].last_hash !== block.hash) {
    await pool.query('UPDATE wallet_deposits SET status="orphaned" WHERE chain_id=? AND block_number=?', [CHAIN_ID, block.number]);
  }

  for (const tx of block.transactions) {
    const to = tx.to ? tx.to.toLowerCase() : null;
    if (to && addrMap.has(to)) {
      const userId = addrMap.get(to);
      await pool.query(
        'INSERT INTO wallet_deposits (user_id, chain_id, address, tx_hash, block_number, block_hash, token_address, amount_wei, confirmations, status) VALUES (?,?,?,?,?,?,NULL,?,0,\'seen\') ON DUPLICATE KEY UPDATE block_number=VALUES(block_number), block_hash=VALUES(block_hash), amount_wei=VALUES(amount_wei)',
        [userId, CHAIN_ID, to, tx.hash, block.number, block.hash, tx.value.toString()]
      );
    }
  }

  await pool.query(
    'UPDATE wallet_deposits SET confirmations=?-block_number WHERE chain_id=? AND status IN (\'seen\',\'confirmed\')',
    [block.number, CHAIN_ID]
  );
  await pool.query(
    'UPDATE wallet_deposits SET status=\'confirmed\' WHERE chain_id=? AND status=\'seen\' AND confirmations>=?',
    [CHAIN_ID, CONFIRMATIONS]
  );

  const [confirmed] = await pool.query(
    "SELECT id,user_id,amount_wei FROM wallet_deposits WHERE chain_id=? AND status='confirmed' AND credited=0",
    [CHAIN_ID]
  );
  for (const dep of confirmed) {
    try {
      await pool.query(
        "INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,'native',?) ON DUPLICATE KEY UPDATE balance_wei=balance_wei+VALUES(balance_wei)",
        [dep.user_id, dep.amount_wei]
      );
      await pool.query('UPDATE wallet_deposits SET credited=1 WHERE id=?', [dep.id]);
    } catch (e) {
      console.error('credit failed', e.code, e.table, e);
    }
  }

  await pool.query('UPDATE chain_cursor SET last_block=?, last_hash=? WHERE chain_id=?', [block.number, block.hash, CHAIN_ID]);
  console.log(`processed block ${block.number}`);
}

async function runStakingAccrual(pool) {
  const today = new Date().toISOString().slice(0, 10);
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [positions] = await conn.query(
      'SELECT id, daily_reward FROM staking_positions WHERE status="active" AND start_date <= ? AND end_date >= ?',
      [today, today]
    );
    for (const p of positions) {
      try {
        await conn.query(
          'INSERT INTO staking_accruals (position_id, accrual_date, amount) VALUES (?,?,?)',
          [p.id, today, p.daily_reward]
        );
        await conn.query('UPDATE staking_positions SET accrued_total=accrued_total+? WHERE id=?', [p.daily_reward, p.id]);
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    await conn.query('UPDATE staking_positions SET status="matured" WHERE status="active" AND end_date < ?', [today]);
    await conn.commit();
    console.log('staking accrual done for', today, positions.length, 'positions');
  } catch (e) {
    if (conn) await conn.rollback();
    console.error('staking accrual failed', e);
  } finally {
    if (conn) conn.release();
  }
}

function scheduleStakingAccrual(pool) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0));
  const ms = next.getTime() - now.getTime();
  setTimeout(() => {
    runStakingAccrual(pool);
    setInterval(() => runStakingAccrual(pool), 24 * 60 * 60 * 1000);
  }, ms);
}

async function main() {
  const pool = await initDb();
  const provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
  const wsProvider = RPC_WS ? new ethers.WebSocketProvider(RPC_WS, CHAIN_ID) : null;
  const cursor = await ensureCursor(pool, provider);
  scheduleStakingAccrual(pool);
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

  const latest = await provider.getBlockNumber();
  const start = Math.max((cursor.last_block || 0) - BACKFILL_BLOCKS, latest - BACKFILL_BLOCKS);
  for (let b = start; b <= latest; b++) {
    await processBlockNumber(b);
  }
  let last = latest;
  if (wsProvider) {
    wsProvider.on('block', processBlockNumber);
  } else {
    setInterval(async () => {
      const latest2 = await provider.getBlockNumber();
      for (let b = last + 1; b <= latest2; b++) {
        await processBlockNumber(b);
      }
      last = latest2;
    }, SCAN_INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error('worker failed', e);
});
