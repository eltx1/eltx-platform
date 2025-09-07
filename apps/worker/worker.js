const mysql = require('mysql2/promise');
const { ethers } = require('ethers');
require('dotenv').config();

// ---- env vars ----
const RUN_ID = Math.random().toString(36).slice(2, 10);
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : undefined;
const BACKFILL_BLOCKS = Number(process.env.BACKFILL_BLOCKS || 5000);
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS || 15000);
const RPC_HTTP = process.env.RPC_HTTP || process.env.BSC_RPC_URL;
const RPC_WS = process.env.RPC_WS;
if (!RPC_HTTP) throw new Error('RPC_HTTP is required');

const CONCURRENCY = 5;
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const tokenMeta = [];
function addToken(symbol, envKey) {
  const addr = process.env[envKey];
  if (addr) {
    tokenMeta.push({
      symbol,
      address: addr.toLowerCase(),
      decimals: Number(process.env[`${envKey}_DECIMALS`] || 18),
    });
  }
}
addToken('USDT', 'TOKEN_USDT');
addToken('USDC', 'TOKEN_USDC');
if (process.env.TOKEN_ELTX) addToken('ELTX', 'TOKEN_ELTX');
const tokenMap = new Map(tokenMeta.map((t) => [t.address, t]));


// ---- utils ----
function maskUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
  } catch {
    return url;
  }
}

function maskHost(host) {
  return host.replace(/(.{3}).*/, '$1***');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, attempts = 3, delayMs = 1000) {
  let err;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw err;
}

// ---- database helpers ----
async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const conn = await pool.getConnection();
  await conn.ping();
  const host = maskHost(conn.connection.config.host);
  const dbName = conn.connection.config.database;
  conn.release();
  console.log(`[DB] connected host=${host} db=${dbName}`);
  return pool;
}

async function detectSchema(pool) {
  const [addrCol] = await pool.query("SHOW COLUMNS FROM wallet_deposits LIKE 'to_address'");
  const addressColumn = addrCol.length ? 'to_address' : 'address';
  const [chainCol] = await pool.query("SHOW COLUMNS FROM wallet_addresses LIKE 'chain_id'");
  const addrHasChain = chainCol.length > 0;
  const [wa] = await pool.query("SHOW TABLES LIKE 'wallet_addresses'");
  const [wd] = await pool.query("SHOW TABLES LIKE 'wallet_deposits'");
  console.log(
    `[TABLES] wallet_addresses=${wa.length > 0} wallet_deposits=${wd.length > 0} addressColumn=${addressColumn}`
  );
  return { addressColumn, addrHasChain };
}

async function loadAddresses(pool, hasChain) {
  const sql = hasChain
    ? 'SELECT address, user_id FROM wallet_addresses WHERE chain_id=?'
    : 'SELECT address, user_id FROM wallet_addresses';
  const params = hasChain ? [CHAIN_ID] : [];
  const [rows] = await pool.query(sql, params);
  const map = new Map();
  for (const r of rows) map.set(r.address.toLowerCase(), r.user_id);
  const sample = Array.from(map.keys()).slice(0, 3);
  console.log(`[WATCH] addresses count=${map.size} sample=${JSON.stringify(sample)}`);
  return map;
}

// ---- table helpers ----
const tableCache = {};
async function tableExists(pool, name) {
  if (tableCache[name] !== undefined) return tableCache[name];
  const [rows] = await pool.query('SHOW TABLES LIKE ?', [name]);
  tableCache[name] = rows.length > 0;
  if (name === 'user_balances' && !tableCache[name]) {
    console.log('[SKIP] user_balances not found — deposits-only mode');
  }
  return tableCache[name];
}

// ---- cursor helpers ----
async function getStartCursor(pool, provider) {
  const tip = await provider.getBlockNumber();
  const [rows] = await pool.query('SELECT last_block FROM chain_cursor WHERE chain_id=?', [CHAIN_ID]);
  let tailStart;
  if (START_BLOCK !== undefined) {
    tailStart = START_BLOCK;
    await pool.query('REPLACE INTO chain_cursor (chain_id,last_block,last_hash) VALUES (?,?,NULL)', [CHAIN_ID, START_BLOCK]);
  } else if (rows.length) {
    tailStart = rows[0].last_block + 1;
  } else {
    tailStart = Math.max(tip - BACKFILL_BLOCKS, 0);
    await pool.query('INSERT INTO chain_cursor (chain_id,last_block,last_hash) VALUES (?,?,NULL)', [CHAIN_ID, tailStart - 1]);
  }

  const backfillFrom = Math.max(tailStart - BACKFILL_BLOCKS, 0);
  console.log(`[CURSOR] tail_start=${tailStart} backfill_from=${backfillFrom}`);
  return { tailStart, backfillFrom };
}

// ---- block/tx helpers ----
async function getTxs(provider, block) {
  if (!block || !block.transactions) return [];
  if (block.transactions.length && typeof block.transactions[0] !== 'string') return block.transactions;
  const txs = [];
  for (let i = 0; i < block.transactions.length; i += CONCURRENCY) {
    const chunk = block.transactions.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(
      chunk.map((h) => provider.getTransaction(h).catch(() => null))
    );
    txs.push(...fetched.filter(Boolean));
    await sleep(50);
  }
  return txs;
}

async function handleBlock(pool, provider, addrMap, addressColumn, block, tip) {
  const [cursor] = await pool.query('SELECT last_block,last_hash FROM chain_cursor WHERE chain_id=?', [CHAIN_ID]);
  if (cursor.length && cursor[0].last_block === block.number && cursor[0].last_hash && cursor[0].last_hash !== block.hash) {
    await pool.query('UPDATE wallet_deposits SET status="orphaned" WHERE chain_id=? AND block_number=?', [CHAIN_ID, block.number]);
  }

  const confirmEdge = Math.max(tip - CONFIRMATIONS, 0);

  const txs = await getTxs(provider, block);
  for (let i = 0; i < txs.length; i += CONCURRENCY) {
    const chunk = txs.slice(i, i + CONCURRENCY);
    const receipts = await Promise.all(
      chunk.map((tx) => provider.getTransactionReceipt(tx.hash).catch(() => null))
    );
    for (let j = 0; j < chunk.length; j++) {
      const tx = chunk[j];
      const rec = receipts[j];
      if (!rec || rec.status !== 1) continue;

      if (tx.to && tx.value > 0n) {
        const to = tx.to.toLowerCase();
        if (addrMap.has(to)) {
          const userId = addrMap.get(to);
          const amount = tx.value.toString();
          const confirmations = tip - block.number + 1;
          const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
          const [res] = await pool.query(
            `INSERT INTO wallet_deposits (user_id, chain_id, ${addressColumn}, tx_hash, block_number, block_hash, token_address, amount_wei, confirmations, status) VALUES (?,?,?,?,?,?,NULL,?,?,?) ON DUPLICATE KEY UPDATE block_number=VALUES(block_number), block_hash=VALUES(block_hash), amount_wei=VALUES(amount_wei), confirmations=VALUES(confirmations), status=VALUES(status)`,
            [userId, CHAIN_ID, to, tx.hash, block.number, block.hash, amount, confirmations, status]
          );
          const result = res.affectedRows === 1 ? 'inserted' : 'updated';
          console.log(
            `[DEPOSIT] detected tx=${tx.hash} addr=${to} wei=${amount} (~${ethers.formatEther(tx.value)}) block=${block.number}`
          );
          console.log(`[DB] upsert wallet_deposits tx=${tx.hash} result=${result}`);
        }
      }

      for (const log of rec.logs) {
        const token = tokenMap.get(log.address.toLowerCase());
        if (!token || log.topics[0] !== TRANSFER_TOPIC) continue;
        const to = '0x' + log.topics[2].slice(26).toLowerCase();
        if (!addrMap.has(to)) continue;
        const userId = addrMap.get(to);
        const value = BigInt(log.data);
        let amt = value;
        const diff = 18 - token.decimals;
        if (diff > 0) amt = value * 10n ** BigInt(diff);
        else if (diff < 0) amt = value / 10n ** BigInt(-diff);
        const confirmations = tip - block.number + 1;
        const status = confirmations >= CONFIRMATIONS ? 'confirmed' : 'pending';
        const [res] = await pool.query(
          `INSERT INTO wallet_deposits (user_id, chain_id, ${addressColumn}, tx_hash, block_number, block_hash, token_address, amount_wei, confirmations, status) VALUES (?,?,?,?,?,?,?, ?,?,?) ON DUPLICATE KEY UPDATE block_number=VALUES(block_number), block_hash=VALUES(block_hash), amount_wei=VALUES(amount_wei), confirmations=VALUES(confirmations), status=VALUES(status)`,
          [
            userId,
            CHAIN_ID,
            to,
            tx.hash,
            block.number,
            block.hash,
            log.address.toLowerCase(),
            amt.toString(),
            confirmations,
            status,
          ]
        );
        const result = res.affectedRows === 1 ? 'inserted' : 'updated';
        console.log(
          `[DEPOSIT][TOKEN] symbol=${token.symbol} tx=${tx.hash} addr=${to} value=${value} wei18=${amt}`
        );
        console.log(`[DB] upsert wallet_deposits tx=${tx.hash} result=${result}`);
      }
    }
    await sleep(50);

  }

  await pool.query(
    'UPDATE wallet_deposits SET confirmations=?-block_number WHERE chain_id=? AND status IN (\'pending\',\'confirmed\') AND block_number<=?',
    [block.number, CHAIN_ID, block.number]
  );
  await pool.query(
    'UPDATE wallet_deposits SET status=\'confirmed\' WHERE chain_id=? AND status=\'pending\' AND block_number<=?',
    [CHAIN_ID, confirmEdge]
  );

  const [rows] = await pool.query(
    "SELECT id,tx_hash,user_id,amount_wei,token_address FROM wallet_deposits WHERE chain_id=? AND status='confirmed' AND credited=0 AND block_number<=?",
    [CHAIN_ID, confirmEdge]
  );
  const hasBalances = await tableExists(pool, 'user_balances');

  for (const dep of rows) {
    try {
      if (hasBalances) {
        await pool.query(
          "INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance_wei=balance_wei+VALUES(balance_wei)",
          [dep.user_id, dep.token_address ? dep.token_address : 'native', dep.amount_wei]

        );
      }
      await pool.query('UPDATE wallet_deposits SET credited=1 WHERE id=?', [dep.id]);
      console.log(`[CREDIT] tx=${dep.tx_hash} set credited=1`);
    } catch (e) {
      console.error('[ERR][SQL]', e.code || e.message);
    }
  }

  await pool.query('UPDATE chain_cursor SET last_block=?, last_hash=? WHERE chain_id=?', [block.number, block.hash, CHAIN_ID]);
  if (block.number % 100 === 0) console.log(`[SCAN] progressed last_block=${block.number}`);
}

// ---- main ----
async function main() {
  console.log(`[BOOT] run_id=${RUN_ID} ethers=${ethers.version}`);
  console.log(
    `[ENV] CHAIN_ID=${CHAIN_ID} CONFIRMATIONS=${CONFIRMATIONS} START_BLOCK=${START_BLOCK ?? 'unset'} BACKFILL_BLOCKS=${BACKFILL_BLOCKS} SCAN_INTERVAL_MS=${SCAN_INTERVAL_MS}`
  );

  const pool = await initDb();
  const provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
  const wsProvider = RPC_WS ? new ethers.WebSocketProvider(RPC_WS, CHAIN_ID) : null;
  const tip = await provider.getBlockNumber();
  console.log(`[RPC] ok chainId=${CHAIN_ID} tip=${tip} using=${maskUrl(RPC_HTTP)}`);

  const { addressColumn, addrHasChain } = await detectSchema(pool);
  let addrMap = await loadAddresses(pool, addrHasChain);
  if (tokenMeta.length) {
    console.log(
      `[TOKENS] contracts=${tokenMeta.map((t) => `${t.symbol}:${t.address}`).join(',')}`
    );
  }

  const { tailStart, backfillFrom } = await getStartCursor(pool, provider);


  // periodic address refresh
  setInterval(async () => {
    try {
      addrMap = await loadAddresses(pool, addrHasChain);
    } catch (e) {
      console.error('[ERR][SQL]', e.code || e.message);
    }
  }, 10 * 60 * 1000);

  let nextBlock = tailStart;
  let backfillCursor = backfillFrom;

  async function backfillLoop() {
    while (backfillCursor < tailStart) {
      try {
        const block = await withRetry(() => provider.getBlock(backfillCursor, true));
        const latest = await provider.getBlockNumber();
        if (block) await handleBlock(pool, provider, addrMap, addressColumn, block, latest);
      } catch (e) {
        console.error('[ERR][RPC]', e.message);
      }
      backfillCursor++;
      await sleep(200);
    }
  }

  async function tailLoop() {
    try {
      const latest = await provider.getBlockNumber();
      while (nextBlock <= latest) {
        const block = await withRetry(() => provider.getBlock(nextBlock, true));
        if (block) await handleBlock(pool, provider, addrMap, addressColumn, block, latest);
        nextBlock++;
      }
    } catch (e) {
      console.error('[ERR][RPC]', e.message);
    }
    setTimeout(tailLoop, SCAN_INTERVAL_MS);
  }

  backfillLoop();
  tailLoop();

  if (wsProvider) {
    wsProvider.on('error', (e) => console.error('[ERR][RPC]', e.message));
  }
}

main().catch((e) => console.error('[ERR][BOOT]', e));

