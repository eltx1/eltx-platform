// worker2.js - head-only deposit scanner for BNB/erc20 on BSC
// Env keys: DATABASE_URL, CHAIN_ID, RPC_HTTP, RPC_WS, CONFIRMATIONS,
// ADDR_REFRESH_MINUTES, SCAN_INTERVAL_MS_2, HEAD_RANGE, TOKENS_JSON

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');
const { ethers } = require('ethers');

// ---- env ----
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const RPC_HTTP = process.env.RPC_HTTP || 'https://bsc-dataseed.bnbchain.org';
const RPC_WS = process.env.RPC_WS || '';
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || 12);
const ADDR_REFRESH_MINUTES = Number(process.env.ADDR_REFRESH_MINUTES || 10);
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS_2 || 10000);
const HEAD_RANGE = Number(process.env.HEAD_RANGE || 200);

let TOKENS = [];
try {
  TOKENS = JSON.parse(process.env.TOKENS_JSON || '[]');
  if (!Array.isArray(TOKENS)) TOKENS = [];
} catch (e) {
  console.warn('[W2][TOKENS] parse error', e.message);
  TOKENS = [];
}
TOKENS = TOKENS
  .filter((t) => t && t.address)
  .map((t) => ({
    symbol: t.symbol || t.address,
    address: String(t.address).toLowerCase(),
  }));

function maskUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
  } catch {
    return url;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- db ----
if (!process.env.DATABASE_URL) {
  console.error('[W2][ERR] DATABASE_URL missing');
  process.exit(1);
}
const pool = mysql.createPool(process.env.DATABASE_URL);

async function initDb() {
  const conn = await pool.getConnection();
  await conn.ping();
  const host = conn.connection.config.host;
  const db = conn.connection.config.database;
  conn.release();
  console.log(`[W2][DB] connected host=${host} db=${db}`);
}

// ---- provider ----
let provider;
if (RPC_WS) {
  try {
    provider = new ethers.WebSocketProvider(RPC_WS, CHAIN_ID);
    provider._ws.on('open', () => console.log('[W2][RPC] websocket connected'));
    provider._ws.on('close', () => console.error('[W2][ERR][RPC] ws closed'));
  } catch (e) {
    console.error('[W2][ERR][RPC] ws init', e);
  }
}
if (!provider) {
  provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
}

// ---- address cache ----
let watchSet = new Set();
let addrMap = new Map();
let lastAddrRefresh = 0;
const ADDR_REFRESH_MS = ADDR_REFRESH_MINUTES * 60 * 1000;

async function refreshAddresses() {
  try {
    const [colRows] = await pool.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_NAME='wallet_addresses' AND COLUMN_NAME='status' LIMIT 1"
    );
    const hasStatus = colRows.length > 0;
    const sql =
      'SELECT user_id, address FROM wallet_addresses WHERE chain_id=?' +
      (hasStatus ? " AND status='active'" : '');
    const [rows] = await pool.query(sql, [CHAIN_ID]);
    watchSet = new Set();
    addrMap = new Map();
    for (const r of rows) {
      const a = String(r.address).toLowerCase();
      watchSet.add(a);
      addrMap.set(a, r.user_id);
    }
    console.log(`[W2][ADDR] loaded=${watchSet.size}`);
  } catch (e) {
    console.error('[W2][ERR][SQL] addr_load', e);
  }
}

// ---- upsert ----
async function upsertDeposit(ctx) {
  const {
    userId,
    address,
    tokenAddress,
    amountWei,
    txHash,
    blockNumber,
    confirmations,
    status,
    credited,
  } = ctx;
  try {
    const [rows] = await pool.query('SELECT id FROM wallet_deposits WHERE tx_hash=? LIMIT 1', [txHash]);
    if (rows[0]) {
      await pool.query(
        'UPDATE wallet_deposits SET confirmations=?, status=?, credited=?, block_number=? WHERE id=?',
        [confirmations, status, credited, blockNumber, rows[0].id]
      );
      console.log('[W2][UPSERT] update ok');
    } else {
      await pool.query(
        'INSERT INTO wallet_deposits (user_id, chain_id, address, token_address, amount_wei, tx_hash, block_number, confirmations, status, credited, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())',
        [
          userId,
          CHAIN_ID,
          address,
          tokenAddress,
          amountWei,
          txHash,
          blockNumber,
          confirmations,
          status,
          credited,
        ]
      );
      console.log('[W2][UPSERT] insert ok');
    }
  } catch (e) {
    console.error('[W2][ERR][SQL] upsert', e);
  }
}

// ---- scanners ----
const erc20Abi = require('../sweeper/erc20.json');
const iface = new ethers.Interface(erc20Abi);
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

async function scanNative(from, tip) {
  for (let b = from; b <= tip; b++) {
    let block;
    try {
      block = await provider.getBlockWithTransactions(b);
    } catch (e) {
      console.error('[W2][ERR][RPC] block', e);
      continue;
    }
    const candidates = [];
    for (const tx of block.transactions) {
      if (!tx.to) continue;
      const to = tx.to.toLowerCase();
      if (!watchSet.has(to)) continue;
      if (tx.value <= 0n) continue;
      candidates.push(tx);
    }
    for (let i = 0; i < candidates.length; i += 5) {
      const chunk = candidates.slice(i, i + 5);
      const receipts = await Promise.all(
        chunk.map((t) => provider.getTransactionReceipt(t.hash).catch((e) => (console.error('[W2][ERR][RPC] receipt', e), null)))
      );
      for (let j = 0; j < chunk.length; j++) {
        const tx = chunk[j];
        const rcpt = receipts[j];
        if (!rcpt || rcpt.status !== 1) continue;
        const to = tx.to.toLowerCase();
        const userId = addrMap.get(to);
        if (!userId) {
          console.warn(`[W2][WARN] user_not_found addr=${to}`);
          continue;
        }
        const conf = tip - tx.blockNumber + 1;
        const status = conf >= CONFIRMATIONS ? 'confirmed' : 'pending';
        const credited = conf >= CONFIRMATIONS ? 1 : 0;
        const amount = tx.value.toString();
        console.log(
          `[W2][BNB] deposit user=${userId} addr=${to} wei=${amount} tx=${tx.hash} conf=${conf} status=${status}`
        );
        await upsertDeposit({
          userId,
          address: to,
          tokenAddress: null,
          amountWei: amount,
          txHash: tx.hash,
          blockNumber: tx.blockNumber,
          confirmations: conf,
          status,
          credited,
        });
      }
    }
  }
}

async function scanErc20(from, tip) {
  for (const token of TOKENS) {
    let logs = [];
    try {
      logs = await provider.getLogs({
        address: token.address,
        fromBlock: from,
        toBlock: tip,
        topics: [TRANSFER_TOPIC],
      });
    } catch (e) {
      console.error('[W2][ERR][RPC] getLogs', token.address, e);
      continue;
    }
    for (const log of logs) {
      let parsed;
      try {
        parsed = iface.parseLog(log);
      } catch (e) {
        console.error('[W2][ERR][LOGPARSE]', e);
        continue;
      }
      const to = String(parsed.args[1]).toLowerCase();
      const value = parsed.args[2];
      if (!watchSet.has(to)) continue;
      if (value <= 0n) continue;
      const userId = addrMap.get(to);
      if (!userId) {
        console.warn(`[W2][WARN] user_not_found addr=${to}`);
        continue;
      }
      const conf = tip - log.blockNumber + 1;
      const status = conf >= CONFIRMATIONS ? 'confirmed' : 'pending';
      const credited = conf >= CONFIRMATIONS ? 1 : 0;
      const amount = BigInt(value).toString();
      console.log(
        `[W2][ERC20] token=${token.symbol} deposit user=${userId} addr=${to} wei=${amount} tx=${log.transactionHash} conf=${conf} status=${status}`
      );
      await upsertDeposit({
        userId,
        address: to,
        tokenAddress: token.address,
        amountWei: amount,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        confirmations: conf,
        status,
        credited,
      });
    }
  }
}

// ---- main loop ----
let lastTipPrinted = 0;

async function tick() {
  const now = Date.now();
  if (now - lastAddrRefresh > ADDR_REFRESH_MS) {
    await refreshAddresses();
    lastAddrRefresh = now;
  }
  let tip;
  try {
    tip = await provider.getBlockNumber();
  } catch (e) {
    console.error('[W2][ERR][RPC] tip', e);
    return;
  }
  const from = Math.max(tip - HEAD_RANGE + 1, 1);
  if (tip !== lastTipPrinted) {
    console.log(`[W2][HEAD] tip=${tip} range=${from}..${tip}`);
    lastTipPrinted = tip;
  }
  await scanNative(from, tip);
  await scanErc20(from, tip);
}

async function main() {
  console.log(
    `[W2][BOOT] chain=${CHAIN_ID} rpc=${maskUrl(RPC_HTTP)} ws=${RPC_WS ? maskUrl(RPC_WS) : 'n/a'} headRange=${HEAD_RANGE} interval=${SCAN_INTERVAL_MS}ms tokens=${TOKENS.length}`
  );
  await initDb();
  await refreshAddresses();
  lastAddrRefresh = Date.now();
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error('[W2][ERR][TICK]', e);
    }
    await sleep(SCAN_INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error('[W2][FATAL]', e);
  process.exit(1);
});

