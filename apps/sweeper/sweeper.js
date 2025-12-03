const mysql = require('mysql2/promise');
const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');
const primaryEnvPath = '/home/dash/.env';
const fallbackEnvPath = path.join(__dirname, '../../.env');
const envPath = fs.existsSync(primaryEnvPath) ? primaryEnvPath : fallbackEnvPath;
require('dotenv').config({ path: envPath });
const { resolveUserId } = require('./depositRecorder');
const { preRecordSweep, finalizeSweep } = require('./recordAndCredit');

// ---- env ----
const VERSION = 'v1';
const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const RPC_HTTP = process.env.RPC_HTTP || process.env.BSC_RPC_URL;
const RPC_WS = process.env.RPC_WS;
if (!RPC_HTTP) throw new Error('RPC_HTTP is required');
const OMNIBUS_ADDRESS = (process.env.OMNIBUS_ADDRESS || '').toLowerCase();
const OMNIBUS_PK = process.env.OMNIBUS_PK;
if (!OMNIBUS_ADDRESS || !OMNIBUS_PK) throw new Error('OMNIBUS_ADDRESS/PK required');

const MASTER_MNEMONIC = (process.env.MASTER_MNEMONIC || '').trim();
process.env.MASTER_MNEMONIC = MASTER_MNEMONIC;

if (!MASTER_MNEMONIC) throw new Error('MASTER_MNEMONIC not set');
if (!ethers.Mnemonic.isValidMnemonic(MASTER_MNEMONIC)) {
  throw new Error('MASTER_MNEMONIC is invalid; please set a valid BIP-39 phrase');
}

const NATIVE_SYMBOL = process.env.NATIVE_SYMBOL || 'BNB';

let TOKEN_REGISTRY = {};
try {
  TOKEN_REGISTRY = require(`../../config/registry/${CHAIN_ID}.json`);
} catch (e) {
  TOKEN_REGISTRY = {};
}
const TOKENS = Object.keys(TOKEN_REGISTRY).map((sym) => ({
  symbol: sym,
  address: TOKEN_REGISTRY[sym].address,
  decimals: TOKEN_REGISTRY[sym].decimals,
}));
const MIN_SWEEP_WEI_BNB = BigInt(process.env.MIN_SWEEP_WEI_BNB || '300000000000000');
const KEEP_BNB_DUST_WEI = BigInt(process.env.KEEP_BNB_DUST_WEI || '1000000000000000');
const MIN_TOKEN_SWEEP_USD = Number(process.env.MIN_TOKEN_SWEEP_USD || '0');
const GAS_DRIP_WEI = BigInt(process.env.GAS_DRIP_WEI || '40000000000000');
const TX_MAX_RETRY = Number(process.env.TX_MAX_RETRY || 3);
const SWEEP_RATE_LIMIT_PER_MIN = Number(process.env.SWEEP_RATE_LIMIT_PER_MIN || 12);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || '1');

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

// helper: احصل على gasPrice (wei) مع fallback وcap
async function resolveGasPriceWei(provider, minGwei = Number(process.env.GAS_PRICE_MIN_GWEI || 3)) {
  const minWei = BigInt(Math.max(1, minGwei)) * 1_000_000_000n;

  try {
    const fd = await provider.getFeeData();
    if (fd && fd.gasPrice != null) {
      let gp = BigInt(fd.gasPrice.toString());
      if (gp < minWei) gp = minWei;
      console.log(`[GAS] feeData gasPrice=${gp} wei (~${Number(gp) / 1e9} gwei) min=${minGwei}`);
      return gp;
    }
  } catch (e) {
    console.warn('[GAS] getFeeData failed, fallback to eth_gasPrice', e?.code || e?.message || e);
  }

  try {
    const hex = await provider.send('eth_gasPrice', []);
    if (typeof hex === 'string') {
      let gp = BigInt(hex);
      if (gp < minWei) gp = minWei;
      console.log(`[GAS] rpc eth_gasPrice=${gp} wei (~${Number(gp) / 1e9} gwei) min=${minGwei}`);
      return gp;
    }
  } catch (e) {
    console.warn('[GAS] eth_gasPrice failed', e?.code || e?.message || e);
  }

  console.log(`[GAS] fallback: using min only ${minGwei} gwei`);
  return minWei;
}

// ---- init ----
async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const conn = await pool.getConnection();
  await conn.ping();
  const [dbRows] = await conn.query('SELECT DATABASE() AS db');
  const dbName = dbRows[0].db;
  conn.release();
  console.log(
    JSON.stringify({
      tag: 'BOOT:ENV',
      chainId: CHAIN_ID,
      dbName,
      cwd: process.cwd(),
      pm2_id: process.env.pm_id || null,
    })
  );
  console.log(JSON.stringify({ tag: 'DB:SELECT', database: dbName }));
  return { pool, dbName };
}

function deriveWallet(index, provider) {
  //return ethers.Wallet.fromPhrase(MASTER_MNEMONIC, `m/44'/60'/0'/0/${index}`).connect(provider);
const realIndex = Number(index) + 1000000;   // ← أهم سطر في حياتك
  return ethers.HDNodeWallet.fromPhrase(
    MASTER_MNEMONIC,
    undefined,
    `m/44'/60'/0'/0/${realIndex}`
  ).connect(provider);
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

async function loadDepositAddresses(chainId, pool) {
  console.log(JSON.stringify({ tag: 'ADDR:LOAD:BEGIN', chainId }));
  const [rows] = await pool.query(
    'SELECT address, derivation_index, user_id FROM wallet_addresses WHERE chain_id=? AND address IS NOT NULL AND address<>""',
    [chainId]
  );
  const list = rows.map((r) => ({ address: r.address.toLowerCase(), derivation_index: r.derivation_index, user_id: r.user_id }));
  if (list.length === 0) {
    console.log(JSON.stringify({ tag: 'ADDR:LOAD:ZERO' }));
  } else {
    console.log(
      JSON.stringify({ tag: 'ADDR:LOAD:OK', rows: list.length, sample: list.slice(0, 3).map((r) => r.address) })
    );
  }
  return list;
}

async function processAddress(row, provider, pool, omnibus) {
  const addr = row.address.toLowerCase();
  const index = Number(row.derivation_index);
  if (!Number.isInteger(index)) {
    console.warn(`[WARN] addr=${addr} invalid_index=${row.derivation_index}`);
    return;
  }
  let wallet;
  try {
    wallet = deriveWallet(index, provider);
  } catch (e) {
    console.error(`[ERR][WALLET] addr=${addr}`, e);
    errorCount++;
    return;
  }
  if (wallet.address.toLowerCase() !== addr) {
    console.warn(`[WARN] addr_mismatch db=${addr} derived=${wallet.address}`);
    return;
  }
  const userId = await resolveUserId(pool, { chainId: CHAIN_ID, addressLc: addr });
  if (!userId) {
    console.log(`[POST][SKIP] no user for address=${addr}`);
  }
  let balBNB = await provider.getBalance(addr);
  let gasPrice = await resolveGasPriceWei(provider);

  for (const token of TOKENS) {
    const symbol = token.symbol.toUpperCase();
    const key = addr + '-' + symbol;
    if (sweepCount >= SWEEP_RATE_LIMIT_PER_MIN) break;
    if (!acquireLock(key)) continue;
    try {
      const reg = TOKEN_REGISTRY[symbol];
      const signerAddress = wallet.address;
      let contractDefined = false;
      let reason = '';
      let contract;
      if (!reg) {
        reason = 'missing_token_in_registry';
      } else {
        try {
          contract = new ethers.Contract(reg.address, erc20Abi, wallet);
          contractDefined = true;
        } catch (e) {
          reason = 'signer_missing';
        }
      }
      console.log(
        JSON.stringify({
          tag: 'ERC20:BUILD_CONTRACT',
          symbol,
          tokenAddress: reg ? reg.address : '',
          signerAddress,
          contractDefined,
        })
      );
      if (!contractDefined) {
        if (userId) {
          try {
            const pre = await preRecordSweep({
              userId,
              chainId: CHAIN_ID,
              address: addr,
              assetSymbol: symbol,
              tokenAddress: reg ? reg.address.toLowerCase() : undefined,
              amountWei: '0',
            });
            await finalizeSweep({
              id: pre.id,
              userId,
              chainId: CHAIN_ID,
              address: addr,
              asset: symbol,
              tokenAddr: pre.tokenAddr,
              amountWei: '0',
              finalTxHash: `err:${pre.key}`,
              status: 'send_error',
              confirmations: 0,
              forced: true,
              error: 'cannot_build_contract',
            });
          } catch {}
        }
        releaseLock(key);
        continue;
      }
      let decimals = reg.decimals;
      if (decimals == null) {
        try {
          decimals = Number(await contract.decimals());
        } catch {}
      }
      if (decimals == null) decimals = 18;
      const bal = await contract.balanceOf(addr);
      const tokenEligible = bal > 0n;
      console.log(`[ERC20] sym=${symbol} bal=${bal} eligible=${tokenEligible}`);
      if (!tokenEligible) {
        releaseLock(key);
        continue;
      }
      if (!userId) {
        console.log(`[POST][SKIP] no user for address=${addr}`);
      }
      const amountDb = bal.toString();
      const amountCredit = bal.toString();
      console.log(
        JSON.stringify({
          tag: 'ERC20:UNITS',
          symbol,
          decimals,
          amount_db_integer: amountDb,
          amount_credit_integer: amountCredit,
        })
      );
      let pre;
      try {
        pre = await preRecordSweep({
          userId,
          chainId: CHAIN_ID,
          address: addr,
          assetSymbol: symbol,
          tokenAddress: reg.address.toLowerCase(),
          amountWei: amountDb,
        });
      } catch (e) {
        releaseLock(key);
        continue;
      }
      balBNB = await provider.getBalance(addr);
      let gasLimit = await contract.transfer.estimateGas(OMNIBUS_ADDRESS, bal, { gasPrice });
      let needed = gasPrice * gasLimit;
      if (balBNB < needed) {
        console.log(
          JSON.stringify({
            tag: 'DRIP:BEGIN',
            depositAddr: addr,
            neededWei: (needed - balBNB).toString(),
            topupWei: GAS_DRIP_WEI.toString(),
          })
        );
        try {
          const dripTx = await withRetry(() =>
            omnibus.sendTransaction({ to: addr, value: GAS_DRIP_WEI, gasPrice, gasLimit: 21000 })
          );
          console.log(JSON.stringify({ tag: 'DRIP:OK', txHash: dripTx.hash }));
          await dripTx.wait(1);
          dripCount++;
          balBNB += GAS_DRIP_WEI;
          gasPrice = await resolveGasPriceWei(provider);
          gasLimit = await contract.transfer.estimateGas(OMNIBUS_ADDRESS, bal, { gasPrice });
        } catch (e) {
          console.log(
            JSON.stringify({ tag: 'DRIP:ERR', providerCode: e.code, message: e.message })
          );
          errorCount++;
        }
        needed = gasPrice * gasLimit;
        if (balBNB < needed) {
          console.log(
            `[SKIP] addr=${addr} asset=${symbol} reason=insufficient_gas have=${balBNB} needed=${needed}`
          );
          if (userId) {
            await finalizeSweep({
              id: pre.id,
              userId,
              chainId: CHAIN_ID,
              address: addr,
              asset: symbol,
              tokenAddr: pre.tokenAddr,
              amountWei: amountCredit,
              finalTxHash: `err:${pre.key}`,
              status: 'send_error',
              confirmations: 0,
              forced: true,
              error: 'no_gas',
            });
          }
          releaseLock(key);
          continue;
        }
      }
      try {
        console.log(
          JSON.stringify({ tag: 'SEND:BEGIN', symbol, amount: amountCredit, tx_hash: pre.txHash })
        );
        const tx = await withRetry(() =>
          contract.transfer(OMNIBUS_ADDRESS, BigInt(amountCredit), { gasPrice, gasLimit })
        );
        console.log(JSON.stringify({ tag: 'SEND:OK', tx_hash: tx.hash }));
        try {
          const receipt = await tx.wait(CONFIRMATIONS);
          console.log(JSON.stringify({ tag: 'WAIT:OK', confirmations: CONFIRMATIONS }));
          if (userId) {
            await finalizeSweep({
              id: pre.id,
              userId,
              chainId: CHAIN_ID,
              address: addr,
              asset: symbol,
              tokenAddr: pre.tokenAddr,
              amountWei: amountCredit,
              finalTxHash: receipt.transactionHash,
              status: 'swept',
              confirmations: CONFIRMATIONS,
            });
          }
          if (receipt.status !== 1) {
            console.log(`[POST][SKIP] reason=receipt_status tx=${tx.hash} status=${receipt.status}`);
          }
          sweepCount++;
        } catch (e) {
          console.log(JSON.stringify({ tag: 'WAIT:ERR', message: e.message }));
          if (userId) {
            await finalizeSweep({
              id: pre.id,
              userId,
              chainId: CHAIN_ID,
              address: addr,
              asset: symbol,
              tokenAddr: pre.tokenAddr,
              amountWei: amountCredit,
              finalTxHash: `err:${pre.key}`,
              status: 'wait_error',
              confirmations: 0,
              forced: true,
              error: e.message,
            });
          }
        }
      } catch (e) {
        console.log(JSON.stringify({ tag: 'SEND:ERR', message: e.message }));
        if (userId) {
          await finalizeSweep({
            id: pre.id,
            userId,
            chainId: CHAIN_ID,
            address: addr,
            asset: symbol,
            tokenAddr: pre.tokenAddr,
            amountWei: amountCredit,
            finalTxHash: `err:${pre.key}`,
            status: 'send_error',
            confirmations: 0,
            forced: true,
            error: e.message,
          });
        }
        errorCount++;
      } finally {
        console.log(`[POST-SWEEP] addr=${addr} asset=${symbol}`);
        releaseLock(key);
      }
    } catch (e) {
      console.error(`[SWEEP][ERR] sweep_send_failed addr=${addr} asset=${symbol}`, e);
      errorCount++;
      releaseLock(key);
    }
  }

  // sweep remaining BNB after ERC20 transfers
  balBNB = await provider.getBalance(addr);
  gasPrice = await resolveGasPriceWei(provider);
  const txCost = gasPrice * 21000n;
  const originalSendAmount = balBNB - txCost - KEEP_BNB_DUST_WEI;
  const gasBuffer = txCost * 2n;
  const sendAmount = originalSendAmount - gasBuffer;
  let eligibleBNB = sendAmount > 0n && balBNB > MIN_SWEEP_WEI_BNB;
  if (!eligibleBNB) {
    console.log('BNB:SKIP below_min');
  } else {
    const keyBNB = addr + '-BNB';
    if (acquireLock(keyBNB) && sweepCount < SWEEP_RATE_LIMIT_PER_MIN) {
      const amountWei = sendAmount;
      let pre;
      try {
        pre = await preRecordSweep({
          userId,
          chainId: CHAIN_ID,
          address: addr,
          assetSymbol: NATIVE_SYMBOL,
          amountWei: amountWei.toString(),
        });
      } catch (e) {
        releaseLock(keyBNB);
        return;
      }
      try {
        console.log(JSON.stringify({ tag: 'SEND:BEGIN', symbol: NATIVE_SYMBOL, amount: amountWei.toString(), tx_hash: pre.txHash }));
        const tx = await withRetry(() =>
          wallet.sendTransaction({ to: OMNIBUS_ADDRESS, value: amountWei, gasPrice, gasLimit: 21000 })
        );
        console.log(JSON.stringify({ tag: 'SEND:OK', tx_hash: tx.hash }));
        try {
          const receipt = await tx.wait(CONFIRMATIONS);
          console.log(JSON.stringify({ tag: 'WAIT:OK', confirmations: CONFIRMATIONS }));
          if (userId) {
            await finalizeSweep({
              id: pre.id,
              userId,
              chainId: CHAIN_ID,
              address: addr,
              asset: NATIVE_SYMBOL,
              tokenAddr: pre.tokenAddr,
              amountWei: amountWei.toString(),
              finalTxHash: receipt.transactionHash,
              status: 'swept',
              confirmations: CONFIRMATIONS,
            });
          }
          if (receipt.status !== 1) {
            console.log(`[POST][SKIP] reason=receipt_status tx=${tx.hash} status=${receipt.status}`);
          }
        } catch (e) {
          console.log(JSON.stringify({ tag: 'WAIT:ERR', message: e.message }));
          if (userId) {
            await finalizeSweep({
              id: pre.id,
              userId,
              chainId: CHAIN_ID,
              address: addr,
              asset: NATIVE_SYMBOL,
              tokenAddr: pre.tokenAddr,
              amountWei: amountWei.toString(),
              finalTxHash: `err:${pre.key}`,
              status: 'wait_error',
              confirmations: 0,
              forced: true,
              error: e.message,
            });
          }
        }
      } catch (e) {
        console.log(JSON.stringify({ tag: 'SEND:ERR', message: e.message }));
        if (userId) {
          await finalizeSweep({
            id: pre.id,
            userId,
            chainId: CHAIN_ID,
            address: addr,
            asset: NATIVE_SYMBOL,
            tokenAddr: pre.tokenAddr,
            amountWei: amountWei.toString(),
            finalTxHash: `err:${pre.key}`,
            status: 'send_error',
            confirmations: 0,
            forced: true,
            error: e.message,
          });
        }
        errorCount++;
      } finally {
        console.log(`[POST-SWEEP] addr=${addr} asset=${NATIVE_SYMBOL}`);
        releaseLock(keyBNB);
      }
    }
  }
}

async function main() {
  console.log(`[BOOT] sweeper ${VERSION} chain=${CHAIN_ID} rpc=${maskUrl(RPC_HTTP)} rate_limit=${SWEEP_RATE_LIMIT_PER_MIN}/min`);
  const { pool } = await initDb();
  const provider = new ethers.JsonRpcProvider(RPC_HTTP, CHAIN_ID);
  const omnibus = new ethers.Wallet(OMNIBUS_PK, provider);
  console.log(JSON.stringify({ tag: 'RPC:READY', chainId: CHAIN_ID, tip: await provider.getBlockNumber() }));

  async function loop() {
    try {
      const list = await loadDepositAddresses(CHAIN_ID, pool);
      if (list.length === 0) {
        console.log(JSON.stringify({ tag: 'SWEEP:SKIP', reason: 'no_addresses' }));
      } else {
        console.log(JSON.stringify({ tag: 'SWEEP:START', addresses: list.length }));
        for (const row of list) {
          console.log(JSON.stringify({ tag: 'SWEEP:ADDR', user_id: row.user_id, address: row.address }));
          await processAddress(row, provider, pool, omnibus);
        }
      }
    } catch (e) {
      console.error('[ERR][LOOP]', e?.code || e?.name || 'ERR', e?.message || e, (e?.stack || '').split('\n')[0]);
    }
    setTimeout(loop, 30 * 1000);
  }

  loop();

  setInterval(() => {
    console.log(`[STATS] sweeps=${sweepCount} drips=${dripCount} errors=${errorCount}`);
  }, 60 * 1000);
}

main().catch((e) => console.error('[ERR][BOOT]', e));
