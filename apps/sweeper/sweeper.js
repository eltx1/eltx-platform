const mysql = require('mysql2/promise');
const { ethers } = require('ethers');
require('dotenv').config();

// ---- env ----
const VERSION = 'v1';
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const RPC_HTTP = process.env.RPC_HTTP || process.env.BSC_RPC_URL;
const RPC_WS = process.env.RPC_WS;
if (!RPC_HTTP) throw new Error('RPC_HTTP is required');
const OMNIBUS_ADDRESS = (process.env.OMNIBUS_ADDRESS || '').toLowerCase();
const OMNIBUS_PK = process.env.OMNIBUS_PK;
if (!OMNIBUS_ADDRESS || !OMNIBUS_PK) throw new Error('OMNIBUS_ADDRESS/PK required');

const TOKENS = process.env.TOKENS_JSON ? JSON.parse(process.env.TOKENS_JSON) : [];
const MIN_SWEEP_WEI_BNB = BigInt(process.env.MIN_SWEEP_WEI_BNB || '300000000000000');
const MIN_TOKEN_SWEEP_USD = Number(process.env.MIN_TOKEN_SWEEP_USD || '0');
const GAS_DRIP_WEI = BigInt(process.env.GAS_DRIP_WEI || '40000000000000');
const GAS_PRICE_CAP = BigInt(process.env.GAS_PRICE_CAP_GWEI || '5') * 1_000_000_000n;
const TX_MAX_RETRY = Number(process.env.TX_MAX_RETRY || 3);
const SWEEP_RATE_LIMIT_PER_MIN = Number(process.env.SWEEP_RATE_LIMIT_PER_MIN || 12);

// ---- utils ----
function maskUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
  } catch {
    return url;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, attempts = TX_MAX_RETRY) {
  let err;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw err;
}

// ---- init ----
async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const conn = await pool.getConnection();
  await conn.ping();
  const host = conn.connection.config.host;
  const dbName = conn.connection.config.database;
  conn.release();
  console.log(`[DB] connected host=${host} db=${dbName}`);
  return pool;
}

function deriveWallet(index, provider) {
  if (!process.env.MASTER_MNEMONIC) throw new Error('MASTER_MNEMONIC not set');
  return ethers.Wallet.fromPhrase(process.env.MASTER_MNEMONIC, `m/44'/60'/0'/0/${index}`).connect(provider);
}

// ---- sweeper ----
const erc20Abi = require('./erc20.json');
const inFlight = new Map();
let sweepCount = 0;
let dripCount = 0;
let errorCount = 0;
setInterval(() => (sweepCount = 0), 60 * 1000);

function acquireLock(key) {
  const now = Date.now();
  const until = inFlight.get(key);
  if (until && until > now) return false;
  inFlight.set(key, now + 3 * 60 * 1000);
  return true;
}

function releaseLock(key) {
  inFlight.delete(key);
}

async function getCandidates(pool) {
  const [rows] = await pool.query(
    "SELECT DISTINCT wd.address, wa.derivation_index FROM wallet_deposits wd JOIN wallet_addresses wa ON wd.address=wa.address WHERE wd.chain_id=? AND wd.status IN ('confirmed','swept') AND wd.credited=1 ORDER BY wd.id DESC LIMIT 1000",
    [CHAIN_ID]
  );
  return rows;
}

async function processAddress(row, provider, pool, omnibus) {
  const addr = row.address.toLowerCase();
  const wallet = deriveWallet(row.derivation_index, provider);
  let balBNB = await provider.getBalance(addr);
  let gasPrice = await provider.getGasPrice();
  if (gasPrice > GAS_PRICE_CAP) gasPrice = GAS_PRICE_CAP;
  const txCost = gasPrice * 21000n;

  if (balBNB > MIN_SWEEP_WEI_BNB && balBNB >= txCost * 10n) {
    const key = addr + '-BNB';
    if (acquireLock(key) && sweepCount < SWEEP_RATE_LIMIT_PER_MIN) {
      const sendAmount = balBNB - txCost;
      try {
        console.log(`[ELIGIBLE] addr=${addr} asset=BNB amount=${sendAmount}`);
        const tx = await withRetry(() => wallet.sendTransaction({ to: OMNIBUS_ADDRESS, value: sendAmount, gasPrice, gasLimit: 21000 }));
        console.log(`[SWEEP] addr=${addr} asset=BNB tx=${tx.hash}`);
        await tx.wait(1);
        console.log(`[CONFIRMED] tx=${tx.hash}`);
        sweepCount++;
      } catch (e) {
        console.error('[ERR][SWEEP]', e.code || e.message);
        errorCount++;
      } finally {
        releaseLock(key);
      }
    }
  }

  for (const token of TOKENS) {
    const key = addr + '-' + token.symbol;
    if (sweepCount >= SWEEP_RATE_LIMIT_PER_MIN) break;
    if (!acquireLock(key)) continue;
    try {
      const erc = new ethers.Contract(token.address, erc20Abi, provider);
      const bal = await erc.balanceOf(addr);
      if (bal <= 0n) {
        releaseLock(key);
        continue;
      }
      console.log(`[ELIGIBLE] addr=${addr} asset=${token.symbol} amount=${bal}`);
      balBNB = await provider.getBalance(addr);
      if (balBNB < txCost) {
        try {
          const dripTx = await withRetry(() => omnibus.sendTransaction({ to: addr, value: GAS_DRIP_WEI, gasPrice, gasLimit: 21000 }));
          console.log(`[DRIP] addr=${addr} tx=${dripTx.hash}`);
          await dripTx.wait(1);
          dripCount++;
          balBNB += GAS_DRIP_WEI;
        } catch (e) {
          console.error('[ERR][DRIP]', e.code || e.message);
          errorCount++;
          releaseLock(key);
          continue;
        }
      }
      const tokenWallet = wallet.connect(provider);
      const contract = new ethers.Contract(token.address, erc20Abi, tokenWallet);
      const tx = await withRetry(() => contract.transfer(OMNIBUS_ADDRESS, bal));
      console.log(`[SWEEP] addr=${addr} asset=${token.symbol} tx=${tx.hash}`);
      await tx.wait(1);
      console.log(`[CONFIRMED] tx=${tx.hash}`);
      sweepCount++;
    } catch (e) {
      console.error('[ERR][SWEEP]', e.code || e.message);
      errorCount++;
    } finally {
      releaseLock(key);
    }
  }
}

async function main() {
  console.log(`[BOOT] sweeper ${VERSION} chain=${CHAIN_ID} rpc=${maskUrl(RPC_HTTP)} rate_limit=${SWEEP_RATE_LIMIT_PER_MIN}/min`);
  const pool = await initDb();
  const provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
  const omnibus = new ethers.Wallet(OMNIBUS_PK, provider);
  console.log(`[RPC] ok chainId=${CHAIN_ID} tip=${await provider.getBlockNumber()}`);

  async function loop() {
    try {
      const list = await getCandidates(pool);
      for (const row of list) {
        await processAddress(row, provider, pool, omnibus);
      }
    } catch (e) {
      console.error('[ERR][LOOP]', e.code || e.message);
    }
    setTimeout(loop, 30 * 1000);
  }

  loop();

  setInterval(() => {
    console.log(`[STATS] sweeps=${sweepCount} drips=${dripCount} errors=${errorCount}`);
  }, 60 * 1000);
}

main().catch((e) => console.error('[ERR][BOOT]', e));
