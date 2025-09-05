const mysql = require('mysql2/promise');
const { ethers } = require('ethers');
require('dotenv').config();

const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const RPC_HTTP = process.env.BSC_RPC_URL || process.env.RPC_HTTP;
if (!RPC_HTTP) throw new Error('BSC_RPC_URL or RPC_HTTP is required');
// optional websocket RPC for faster block updates
const RPC_WS = process.env.RPC_WS;
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS || 15000);
const BACKFILL_BLOCKS = Number(process.env.BACKFILL_BLOCKS || 5000);
const ADDR_REFRESH_MINUTES = Number(process.env.ADDR_REFRESH_MINUTES || 10);
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = mysql.createPool(process.env.DATABASE_URL);
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('database connection established');
  } catch (e) {
    console.error('database connection failed', e);
    throw e;
  }
  return pool;
}

async function loadActiveAddresses(pool) {
  const [rows] = await pool.query('SELECT address, user_id FROM wallet_addresses WHERE chain_id=?', [CHAIN_ID]);
  const map = new Map();
  for (const r of rows) map.set(r.address.trim().toLowerCase(), r.user_id);
  return map;
}

async function ensureCursor(pool, provider) {
  const latest = await provider.getBlockNumber();
  // allow forcing a specific starting block via START_BLOCK env
  const startEnv = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;
  const [rows] = await pool.query('SELECT last_block,last_hash FROM chain_cursor WHERE chain_id=?', [CHAIN_ID]);
  if (startEnv !== null) {
    await pool.query('REPLACE INTO chain_cursor (chain_id,last_block,last_hash) VALUES (?,?,NULL)', [CHAIN_ID, startEnv]);
    return { last_block: startEnv, last_hash: null };
  }
  if (!rows.length) {
    const start = latest - 3;
    await pool.query('INSERT INTO chain_cursor (chain_id,last_block,last_hash) VALUES (?,?,NULL)', [CHAIN_ID, start]);
    return { last_block: start, last_hash: null };
  }
  return rows[0];
}

async function handleBlock(pool, provider, addrMap, block) {
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
      console.log(`stored deposit tx ${tx.hash} for user ${userId} address ${to} amount ${tx.value.toString()}`);
    }
  }

  // token transfers (ERC20/BEP20) to monitored addresses
  const addrTopics = Array.from(addrMap.keys()).map((a) => ethers.zeroPadValue(a, 32));
  if (addrTopics.length) {
    const logs = [];
    const chunkSize = 50;
    for (let i = 0; i < addrTopics.length; i += chunkSize) {
      const chunk = addrTopics.slice(i, i + chunkSize);
      const chunkLogs = await provider.getLogs({
        fromBlock: block.number,
        toBlock: block.number,
        topics: [TRANSFER_TOPIC, null, chunk],
      });
      logs.push(...chunkLogs);
    }
    for (const log of logs) {
      const to = '0x' + log.topics[2].slice(26);
      const lower = to.toLowerCase();
      const userId = addrMap.get(lower);
      if (!userId) continue;
      const amount = BigInt(log.data).toString();
      await pool.query(
        'INSERT INTO wallet_deposits (user_id, chain_id, address, tx_hash, block_number, block_hash, token_address, amount_wei, confirmations, status) VALUES (?,?,?,?,?,?,?, ?,0,\'seen\') ON DUPLICATE KEY UPDATE block_number=VALUES(block_number), block_hash=VALUES(block_hash), amount_wei=VALUES(amount_wei)',
        [userId, CHAIN_ID, lower, log.transactionHash, log.blockNumber, log.blockHash, log.address.toLowerCase(), amount]
      );
      console.log(`stored token deposit tx ${log.transactionHash} for user ${userId} address ${lower} token ${log.address.toLowerCase()} amount ${amount}`);
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

  try {
    const latest = await provider.getBlockNumber();
    console.log(`RPC connection established to ${RPC_HTTP} (chain ${CHAIN_ID}), latest block ${latest}`);
    if (wsProvider) {
      await wsProvider.getBlockNumber();
      console.log(`RPC WS connection established to ${RPC_WS}`);
    }
  } catch (e) {
    console.error('RPC connection failed', e);
    throw e;
  }

  const cursor = await ensureCursor(pool, provider);
  scheduleStakingAccrual(pool);
  let addrMap = await loadActiveAddresses(pool);
  if (addrMap.size === 0) console.warn('no active addresses loaded');
  console.log('monitoring addresses', Array.from(addrMap.keys()));
  setInterval(async () => {
    try {
      addrMap = await loadActiveAddresses(pool);
      if (addrMap.size === 0) console.warn('no active addresses loaded');
      console.log('refreshed address list', Array.from(addrMap.keys()));
    } catch (e) {
      console.error('address refresh failed', e);
    }
  }, ADDR_REFRESH_MINUTES * 60 * 1000);
  let backfillCursor = Math.max((cursor.last_block || 0) - BACKFILL_BLOCKS, 0);

  const processBlockNumber = async (num) => {
    try {
      const block = await provider.getBlock(num, true);
      if (block) await handleBlock(pool, provider, addrMap, block);
    } catch (e) {
      console.error('block error', e);
    }
  };

  const scheduleBackfill = () => {
    if (backfillCursor <= 0) return;
    setTimeout(() => {
      processBlockNumber(backfillCursor).catch((e) => console.error('block error', e));
    }, 0);
    backfillCursor--;
  };

  const latest = await provider.getBlockNumber();
  const start = Math.max((cursor.last_block || 0) + 1 - BACKFILL_BLOCKS, 0);
  console.log(`starting block scan from ${start} to ${latest}`);
  for (let b = start; b <= latest; b++) {
    await processBlockNumber(b);
    scheduleBackfill();
  }
  let last = latest;
  if (wsProvider) {
    wsProvider.on('block', async (b) => {
      await processBlockNumber(b);
      scheduleBackfill();
    });
  } else {
    setInterval(async () => {
      const latest2 = await provider.getBlockNumber();
      for (let b = last + 1; b <= latest2; b++) {
        await processBlockNumber(b);
        scheduleBackfill();
      }
      last = latest2;
    }, SCAN_INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error('worker failed', e);
});
