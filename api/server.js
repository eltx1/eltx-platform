const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { ethers } = require('ethers');
const Decimal = require('decimal.js');
const { provisionUserAddress, getUserBalance } = require('./src/services/wallet');
const {
  syncSwapAssetPrices,
  getSwapAssetConfig,
  getSwapPricingMode,
  isSupportedSwapAsset,
} = require('./src/services/pricing');
require('dotenv').config();

['MASTER_MNEMONIC', 'DATABASE_URL'].forEach((v) => {
  if (!process.env[v]) throw new Error(`${v} is not set`);
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['https://eltx.online'];
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});
app.use(express.json());
app.use(cookieParser());
// ensure wallet routes are not cached
const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Vary', 'Authorization, Cookie');
  next();
};

app.use(['/wallet', '/api/wallet', '/api/transactions'], noCache);

const pool = mysql.createPool(
  process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eltx',
  }
);

const walletSchemaPath = path.join(__dirname, '../db/wallet.sql');
let walletStatements = [];
try {
  const schema = fs.readFileSync(walletSchemaPath, 'utf8');
  walletStatements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
} catch (err) {
  console.error('Failed to load wallet schema file', err);
}

let walletSchemaEnsured = false;
let walletSchemaPromise = null;

const originalPoolQuery = pool.query.bind(pool);
const originalGetConnection = pool.getConnection.bind(pool);

async function ensureWalletSchema() {
  if (walletSchemaEnsured) return;
  if (!walletStatements.length) throw new Error('Wallet schema is empty');
  if (!walletSchemaPromise) {
    const runner = (async () => {
      const conn = await originalGetConnection();
      const originalConnQuery = conn.query.bind(conn);
      try {
        for (const sql of walletStatements) {
          if (/DROP COLUMN IF EXISTS/i.test(sql) || /DROP INDEX IF EXISTS/i.test(sql)) {
            const tableMatch = sql.match(/ALTER TABLE\s+([`\w]+)/i);
            if (!tableMatch) continue;
            const table = tableMatch[1].replace(/`/g, '');
            try {
              const [tbl] = await originalConnQuery('SHOW TABLES LIKE ?', [table]);
              if (!tbl.length) {
                console.warn(`table ${table} missing, skip drop`);
              } else {
                if (/DROP COLUMN IF EXISTS/i.test(sql)) {
                  const dropCols = [...sql.matchAll(/DROP COLUMN IF EXISTS\s+([`\w]+)/gi)].map((m) =>
                    m[1].replace(/`/g, '')
                  );
                  for (const column of dropCols) {
                    const [cols] = await originalConnQuery(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
                    if (cols.length) await originalConnQuery(`ALTER TABLE ${table} DROP COLUMN ${column}`);
                    else console.warn(`${table}.${column} missing, skip drop`);
                  }
                }
                if (/DROP INDEX IF EXISTS/i.test(sql)) {
                  const dropIdx = [...sql.matchAll(/DROP INDEX IF EXISTS\s+([`\w]+)/gi)].map((m) =>
                    m[1].replace(/`/g, '')
                  );
                  for (const index of dropIdx) {
                    const [idxs] = await originalConnQuery(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [index]);
                    if (idxs.length) await originalConnQuery(`ALTER TABLE ${table} DROP INDEX ${index}`);
                    else console.warn(`${table}.${index} index missing, skip drop`);
                  }
                }
              }
            } catch (e) {
              console.warn('schema adjust failed', e);
            }

            const cleaned = sql
              .replace(/DROP COLUMN IF EXISTS\s+[`\w]+(?:,)?/gi, '')
              .replace(/DROP INDEX IF EXISTS\s+[`\w]+(?:,)?/gi, '')
              .replace(/,\s*;/g, ';')
              .trim();
            if (cleaned && !/^ALTER TABLE\s+[`\w]+\s*;?$/i.test(cleaned)) {
              await originalConnQuery(cleaned);
            }
            continue;
          }
          await originalConnQuery(sql);
        }
      } finally {
        conn.release();
      }
    })();
    walletSchemaPromise = runner
      .then(() => {
        walletSchemaEnsured = true;
        console.log('Wallet schema ready');
      })
      .catch((err) => {
        walletSchemaEnsured = false;
        console.error('Wallet schema sync failed', err);
        throw err;
      })
      .finally(() => {
        walletSchemaPromise = null;
      });
  }
  return walletSchemaPromise;
}

function isMissingTableError(err) {
  if (!err) return false;
  if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146) return true;
  const message = err.sqlMessage || err.message;
  return typeof message === 'string' && message.toLowerCase().includes("doesn't exist");
}

async function handleMissingTable(err) {
  if (!isMissingTableError(err)) return false;
  walletSchemaEnsured = false;
  try {
    await ensureWalletSchema();
    return true;
  } catch (schemaErr) {
    console.error('Failed to recover schema after missing table', schemaErr);
    return false;
  }
}

function wrapQuery(context, originalQuery) {
  return async function wrappedQuery(...args) {
    try {
      return await originalQuery.apply(context, args);
    } catch (err) {
      if (await handleMissingTable(err)) {
        return originalQuery.apply(context, args);
      }
      throw err;
    }
  };
}

pool.query = wrapQuery(pool, originalPoolQuery);

pool.getConnection = async function (...args) {
  const conn = await originalGetConnection(...args);
  const originalConnQuery = conn.query.bind(conn);
  conn.query = wrapQuery(conn, originalConnQuery);
  return conn;
};

ensureWalletSchema().catch(() => {});

// start background scanner runner
const startRunner = require('./background/runner');
startRunner(pool);

function createJsonRateLimiter({ windowMs, max, code = 'RATE_LIMITED', message = 'Too many requests. Please slow down.' }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      const status = options?.statusCode ?? 429;
      res.status(status).json({ ok: false, error: { code, message } });
    },
  });
}

const loginLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please wait before trying again.',
});
const walletLimiter = createJsonRateLimiter({ windowMs: 60 * 1000, max: 120 });
const spotDataLimiter = createJsonRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
  message: 'Too many spot refresh requests. Please slow down.',
});

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const sessionCookie = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  domain: process.env.SESSION_COOKIE_DOMAIN || '.eltx.online',
  path: '/',
  maxAge: 1000 * 60 * 60,
};

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3),
  language: z.string().optional(),
});

const LoginSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().min(3).optional(),
    password: z.string().min(8),
  })
  .refine((d) => d.email || d.username, {
    message: 'Email or username required',
  });

const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const SUPPORTED_CHAINS = [56, 1];
const DEFAULT_CHAIN_BY_SYMBOL = { BNB: 56, ETH: 1, ELTX: CHAIN_ID };

// token metadata from registry files (all supported chains) and env
const tokenMeta = {};
const tokenMetaBySymbol = {};

function registerToken(meta, chainId) {
  const normalized = { ...meta, chainId };
  if (meta.contract) {
    tokenMeta[meta.contract.toLowerCase()] = normalized;
  }
  const symKey = meta.symbol.toUpperCase();
  if (!tokenMetaBySymbol[symKey] || chainId === CHAIN_ID) {
    tokenMetaBySymbol[symKey] = normalized;
  }
}

for (const cid of SUPPORTED_CHAINS) {
  try {
    const registry = require(path.join(__dirname, `../config/registry/${cid}.json`));
    for (const [sym, info] of Object.entries(registry)) {
      registerToken({ symbol: sym, contract: info.address, decimals: info.decimals }, cid);
    }
  } catch (e) {}
}
function addToken(symbol, envKey) {
  const addr = process.env[envKey];
  if (addr) {
    registerToken(
      {
        symbol,
        contract: addr,
        decimals: Number(process.env[`${envKey}_DECIMALS`] || 18),
      },
      CHAIN_ID
    );
  }
}
addToken('USDT', 'TOKEN_USDT');
addToken('USDC', 'TOKEN_USDC');
if (process.env.TOKEN_ELTX) addToken('ELTX', 'TOKEN_ELTX');

function formatUnitsStr(weiStr, decimals = 18) {
  try {
    const wei = BigInt(weiStr);
    const base = 10n ** BigInt(decimals);
    const integer = wei / base;
    const fraction = (wei % base).toString().padStart(decimals, '0');
    return `${integer}.${fraction}`;
  } catch {
    return '0';
  }
}

function trimDecimal(value) {
  if (value === null || value === undefined) return '0';
  const str = value.toString();
  if (!str.includes('.')) return str;
  const trimmed = str.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return normalized.length ? normalized : '0';
}

const ZERO_DECIMAL_REGEX = /^0(?:\.0+)?$/;
function isZeroDecimal(value) {
  if (value === null || value === undefined) return true;
  return ZERO_DECIMAL_REGEX.test(value.toString());
}

const ELTX_SYMBOL = 'ELTX';

function getSymbolDecimals(symbol) {
  const meta = tokenMetaBySymbol[symbol];
  if (meta && meta.decimals !== undefined && meta.decimals !== null)
    return Number(meta.decimals);
  if (symbol === ELTX_SYMBOL) return Number(process.env.TOKEN_ELTX_DECIMALS || 18);
  return 18;
}

const QUOTE_TTL_MS = Number(process.env.TRADE_QUOTE_TTL_MS || 60_000);
const PRICE_SCALE = 10n ** 18n;
Decimal.set({ precision: 60, toExpNeg: -40, toExpPos: 40 });
const DECIMAL_TEN = new Decimal(10);

function decimalFromWei(value, decimals) {
  if (value === null || value === undefined) return new Decimal(0);
  const normalized = value.toString();
  if (!normalized || normalized === '0') return new Decimal(0);
  try {
    return new Decimal(normalized).div(DECIMAL_TEN.pow(decimals));
  } catch {
    return new Decimal(0);
  }
}

function formatDecimalValue(decimalValue, places = 8) {
  let decimalInstance;
  if (decimalValue instanceof Decimal) {
    decimalInstance = decimalValue;
  } else {
    try {
      decimalInstance = new Decimal(decimalValue);
    } catch {
      return '0';
    }
  }
  try {
    const fixed = decimalInstance.toFixed(places, Decimal.ROUND_DOWN);
    const trimmed = trimDecimal(fixed);
    return trimmed === '-0' ? '0' : trimmed;
  } catch {
    return '0';
  }
}

function bigIntFromValue(val) {
  const str = val?.toString() || '0';
  const normalized = str.includes('.') ? str.split('.')[0] : str;
  try {
    return BigInt(normalized);
  } catch {
    return 0n;
  }
}

async function getPlatformSettingValue(name, defaultValue = '0', conn = pool) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query('SELECT value FROM platform_settings WHERE name=?', [name]);
  if (!rows.length || rows[0].value === undefined || rows[0].value === null) return defaultValue;
  return rows[0].value.toString();
}

async function getSwapPoolRow(conn, asset, { forUpdate = false } = {}) {
  const executor = conn.query ? conn : pool;
  const sql = `SELECT asset, asset_decimals, asset_reserve_wei, eltx_reserve_wei FROM swap_liquidity_pools WHERE UPPER(asset)=?${
    forUpdate ? ' FOR UPDATE' : ''
  }`;
  const [rows] = await executor.query(sql, [asset]);
  if (!rows.length) return null;
  return rows[0];
}

async function updateSwapPool(conn, asset, assetReserveWei, eltxReserveWei) {
  await conn.query(
    'UPDATE swap_liquidity_pools SET asset_reserve_wei=?, eltx_reserve_wei=? WHERE UPPER(asset)=?',
    [assetReserveWei.toString(), eltxReserveWei.toString(), asset]
  );
}

function mulDiv(a, b, denom) {
  if (denom === 0n) throw new Error('Division by zero');
  return (a * b) / denom;
}

function normalizeMarketSymbol(symbol) {
  return symbol.replace(/\s+/g, '').toUpperCase().replace('-', '/');
}

async function getSpotMarket(conn, symbol, { forUpdate = false } = {}) {
  const normalized = normalizeMarketSymbol(symbol);
  const executor = conn.query ? conn : pool;
  const sql = `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount, price_precision, amount_precision, active FROM spot_markets WHERE symbol=?${
    forUpdate ? ' FOR UPDATE' : ''
  }`;
  const [rows] = await executor.query(sql, [normalized]);
  return rows.length ? rows[0] : null;
}

function computeQuoteAmount(baseWei, priceWei) {
  return mulDiv(baseWei, priceWei, PRICE_SCALE);
}

function clampBps(value) {
  if (value < 0n) return 0n;
  if (value > 10000n) return 10000n;
  return value;
}

async function matchSpotOrder(conn, market, taker) {
  const result = {
    filledBase: 0n,
    spentQuote: 0n,
    receivedQuote: 0n,
    receivedBase: 0n,
    takerFee: 0n,
    trades: [],
    averagePriceWei: 0n,
  };
  const oppositeSide = taker.side === 'buy' ? 'sell' : 'buy';
  const priceClause = taker.type === 'limit'
    ? taker.side === 'buy'
      ? 'AND price_wei <= ?'
      : 'AND price_wei >= ?'
    : '';
  const orderBy = taker.side === 'buy' ? 'price_wei ASC, id ASC' : 'price_wei DESC, id ASC';
  const baseParams = [market.id, oppositeSide];
  if (taker.type === 'limit') baseParams.push(taker.priceWei.toString());

  while (taker.remainingBase > 0n) {
    const params = [...baseParams];
    const [matchRows] = await conn.query(
      `SELECT id, user_id, price_wei, remaining_base_wei, remaining_quote_wei, fee_bps
       FROM spot_orders
       WHERE market_id=? AND side=? AND status='open' ${priceClause}
       ORDER BY ${orderBy}
       LIMIT 1 FOR UPDATE`,
      params
    );
    if (!matchRows.length) break;
    const maker = matchRows[0];
    const makerRemainingBase = bigIntFromValue(maker.remaining_base_wei);
    if (makerRemainingBase <= 0n) {
      await conn.query('UPDATE spot_orders SET remaining_base_wei=0, status="filled" WHERE id=?', [maker.id]);
      continue;
    }
    const makerPriceWei = BigInt(maker.price_wei);
    if (makerPriceWei <= 0n) {
      await conn.query('UPDATE spot_orders SET status="cancelled" WHERE id=?', [maker.id]);
      continue;
    }

    let tradeBase = taker.remainingBase < makerRemainingBase ? taker.remainingBase : makerRemainingBase;
    if (tradeBase <= 0n) break;

    const makerFeeBps = clampBps(bigIntFromValue(maker.fee_bps || 0));
    const takerFeeBps = clampBps(BigInt(taker.feeBps || 0));

    const feeMultiplier = 10000n + takerFeeBps;
    const costPerBase = mulDiv(makerPriceWei, feeMultiplier, 10000n);

    if (taker.side === 'buy') {
      const availableQuote = taker.type === 'market' ? taker.availableQuote : taker.remainingQuote;
      let takerCost = mulDiv(tradeBase, costPerBase, PRICE_SCALE);
      if (takerCost > availableQuote) {
        const maxBase = mulDiv(availableQuote, PRICE_SCALE, costPerBase);
        if (maxBase <= 0n) break;
        tradeBase = maxBase;
        takerCost = mulDiv(tradeBase, costPerBase, PRICE_SCALE);
      }
      if (tradeBase <= 0n) break;
    }

    const quoteWithoutFee = computeQuoteAmount(tradeBase, makerPriceWei);
    if (quoteWithoutFee <= 0n) {
      await conn.query('UPDATE spot_orders SET status="cancelled" WHERE id=?', [maker.id]);
      continue;
    }

    const takerFee = (quoteWithoutFee * takerFeeBps) / 10000n;
    const makerFee = (quoteWithoutFee * makerFeeBps) / 10000n;
    const takerCost = taker.side === 'buy' ? quoteWithoutFee + takerFee : 0n;
    const takerReceiveQuote = taker.side === 'sell' ? quoteWithoutFee - takerFee : 0n;

    if (taker.side === 'buy') {
      if (taker.type === 'market') taker.availableQuote -= takerCost;
      else taker.remainingQuote -= takerCost;
      result.spentQuote += takerCost;
      result.receivedBase += tradeBase;
    } else {
      result.receivedQuote += takerReceiveQuote;
    }
    result.filledBase += tradeBase;
    result.takerFee += takerFee;
    taker.remainingBase -= tradeBase;

    const makerNetQuote = quoteWithoutFee - makerFee;
    let makerRemainingQuote = bigIntFromValue(maker.remaining_quote_wei);
    let refundQuote = 0n;
    if (oppositeSide === 'buy') {
      const makerCost = quoteWithoutFee + makerFee;
      makerRemainingQuote = makerRemainingQuote > makerCost ? makerRemainingQuote - makerCost : 0n;
    }
    const newMakerRemainingBase = makerRemainingBase - tradeBase;
    let makerStatus = newMakerRemainingBase <= 0n ? 'filled' : 'open';
    if (makerStatus === 'filled' && makerRemainingQuote > 0n) {
      refundQuote = makerRemainingQuote;
      makerRemainingQuote = 0n;
    }
    await conn.query('UPDATE spot_orders SET remaining_base_wei=?, remaining_quote_wei=?, status=? WHERE id=?', [
      newMakerRemainingBase.toString(),
      makerRemainingQuote.toString(),
      makerStatus,
      maker.id,
    ]);

    if (oppositeSide === 'sell') {
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
        [maker.user_id, market.quote_asset, makerNetQuote.toString()]
      );
    } else {
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
        [maker.user_id, market.base_asset, tradeBase.toString()]
      );
    }
    if (refundQuote > 0n) {
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
        [maker.user_id, market.quote_asset, refundQuote.toString()]
      );
    }

    const buyOrderId = taker.side === 'buy' ? taker.id : maker.id;
    const sellOrderId = taker.side === 'sell' ? taker.id : maker.id;
    const buyFeeWei = taker.side === 'buy' ? takerFee : makerFee;
    const sellFeeWei = taker.side === 'sell' ? takerFee : makerFee;
    const [tradeInsert] = await conn.query(
      'INSERT INTO spot_trades (market_id, buy_order_id, sell_order_id, price_wei, base_amount_wei, quote_amount_wei, buy_fee_wei, sell_fee_wei, fee_asset, taker_side) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        market.id,
        buyOrderId,
        sellOrderId,
        makerPriceWei.toString(),
        tradeBase.toString(),
        quoteWithoutFee.toString(),
        buyFeeWei.toString(),
        sellFeeWei.toString(),
        market.quote_asset,
        taker.side,
      ]
    );
    const tradeId = tradeInsert.insertId;
    if (takerFee > 0n) {
      await conn.query('INSERT INTO platform_fees (fee_type, reference, asset, amount_wei) VALUES (?,?,?,?)', [
        'spot',
        `trade:${tradeId}:taker`,
        market.quote_asset,
        takerFee.toString(),
      ]);
    }
    if (makerFee > 0n) {
      await conn.query('INSERT INTO platform_fees (fee_type, reference, asset, amount_wei) VALUES (?,?,?,?)', [
        'spot',
        `trade:${tradeId}:maker:${maker.id}`,
        market.quote_asset,
        makerFee.toString(),
      ]);
    }

    result.trades.push({
      trade_id: tradeId,
      maker_order_id: maker.id,
      price_wei: makerPriceWei,
      base_amount_wei: tradeBase,
      quote_amount_wei: quoteWithoutFee,
      taker_fee_wei: takerFee,
      maker_fee_wei: makerFee,
    });

    if (taker.side === 'buy') {
      if (taker.type === 'market' && taker.availableQuote <= 0n) break;
      if (taker.type === 'limit' && taker.remainingQuote <= 0n) break;
    }
  }

  if (result.filledBase > 0n) {
    const grossQuote = taker.side === 'buy' ? result.spentQuote - result.takerFee : result.receivedQuote + result.takerFee;
    if (grossQuote > 0n) result.averagePriceWei = mulDiv(grossQuote, PRICE_SCALE, result.filledBase);
  }

  return result;
}

const TransferSchema = z.object({
  to_user_id: z.coerce.number().int().positive(),
  asset: z.enum(['BNB', 'ETH', 'USDC', 'USDT']),
  amount: z.string(),
});

const TradeQuoteSchema = z.object({
  asset: z.string().min(2).max(32),
  amount: z.string().min(1),
});

const TradeExecuteSchema = z.object({
  quote_id: z.string().uuid(),
});

const SpotOrderSchema = z.object({
  market: z.string().min(3).max(32),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['limit', 'market']),
  amount: z.string().min(1),
  price: z.string().optional(),
});

const SpotOrderbookSchema = z.object({
  market: z.string().min(3).max(32),
});

const SpotOrdersQuerySchema = z.object({
  market: z.string().min(3).max(32).optional(),
});

const SpotCandlesQuerySchema = z.object({
  market: z.string().min(3).max(32),
  interval: z.enum(['5m', '1h', '1d']).default('5m'),
  limit: z.coerce.number().int().min(10).max(500).default(200),
});

const CANDLE_INTERVALS = {
  '5m': { seconds: 300 },
  '1h': { seconds: 3600 },
  '1d': { seconds: 86400 },
};

async function requireUser(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) throw { status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' };
  const [rows] = await pool.query(
    'SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > NOW()',
    [token]
  );
  if (!rows.length) throw { status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' };
  return rows[0].id;
}

app.post('/auth/signup', async (req, res, next) => {
  let conn;
  try {
    const { email, password, username, language } = SignupSchema.parse(req.body);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [u] = await conn.query(
      'INSERT INTO users (email, username, language) VALUES (?, ?, ?)',
      [email, username, language || 'en']
    );
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await conn.query('INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)', [u.insertId, hash]);
    const token = crypto.randomUUID();
    await conn.query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
      [token, u.insertId]
    );
    const wallets = [];
    for (const cid of SUPPORTED_CHAINS) {
      wallets.push(await provisionUserAddress(conn, u.insertId, cid));
    }
    await conn.commit();
    res.cookie(COOKIE_NAME, token, sessionCookie);
    res.json({ ok: true, wallet: wallets[0], wallets });
  } catch (err) {
    if (conn) await conn.rollback();
    if (err instanceof z.ZodError) {
      const missing = err.errors
        .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
        .map((e) => e.path[0]);
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: { missing } });
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return next({ status: 409, code: 'USER_EXISTS', message: 'Email or username already exists' });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/auth/login', loginLimiter, async (req, res, next) => {
  let userId = null;
  try {
    const { email, username, password } = LoginSchema.parse(req.body);
    const field = email ? 'email' : 'username';
    const [rows] = await pool.query(
      `SELECT users.id, uc.password_hash FROM users JOIN user_credentials uc ON users.id=uc.user_id WHERE users.${field}=?`,
      [email || username]
    );
    if (rows.length) {
      userId = rows[0].id;
      const valid = await argon2.verify(rows[0].password_hash, password);
      if (valid) {
        const token = crypto.randomUUID();
        await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [
          token,
          userId,
        ]);
        await pool.query('INSERT INTO login_attempts (user_id, ip, success) VALUES (?, ?, 1)', [userId, req.ip]);
        const wallets = [];
        for (const cid of SUPPORTED_CHAINS) {
          wallets.push(await provisionUserAddress(pool, userId, cid));
        }
        res.cookie(COOKIE_NAME, token, sessionCookie);
        return res.json({ ok: true, wallet: wallets[0], wallets });
      }
    }
    await pool.query('INSERT INTO login_attempts (user_id, ip, success) VALUES (?, ?, 0)', [userId, req.ip]);
    return next({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const missing = err.errors
        .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
        .map((e) => e.path[0]);
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: { missing } });
    }
    next(err);
  }
});

app.post('/auth/logout', async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    await pool.query('DELETE FROM sessions WHERE id = ?', [token]);
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/auth/me', async (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next({ status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' });
  try {
    const [rows] = await pool.query(
      'SELECT users.id, users.email FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > NOW()',
      [token]
    );
    if (!rows.length) return next({ status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

app.get('/wallet/me', walletLimiter, async (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next({ status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' });
  try {
    const [rows] = await pool.query(
      'SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > NOW()',
      [token]
    );
    if (!rows.length) return next({ status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' });
    const userId = rows[0].id;
    const wallet = await provisionUserAddress(pool, userId, CHAIN_ID);
    const [deps] = await pool.query(
      'SELECT tx_hash, token_address, token_symbol, amount_wei, confirmations, status, created_at FROM wallet_deposits WHERE user_id=? AND chain_id=? ORDER BY created_at DESC LIMIT 50',
      [userId, CHAIN_ID]
    );
    const depositSchema = z.object({
      tx_hash: z.string(),
      token_address: z.string(),
      token_symbol: z.string().nullable().optional(),
      amount_wei: z.string(),
      confirmations: z.coerce.number(),
      status: z.enum(['seen', 'confirmed', 'swept', 'orphaned']),
      created_at: z.coerce.date(),
    });
    const deposits = z.array(depositSchema).parse(deps);
    const ZERO = '0x0000000000000000000000000000000000000000';
    for (const row of deposits) {
      row.token_address = (row.token_address || ZERO).toLowerCase();
      if (row.token_address === ZERO) {
        row.display_symbol = row.token_symbol || 'BNB';
      } else {
        const meta = tokenMeta[row.token_address];
        row.display_symbol = row.token_symbol || (meta ? meta.symbol : 'UNKNOWN');
      }
    }
    res.json({ ok: true, wallet, deposits });
  } catch (err) {
    next(err);
  }
});

app.get('/wallet/address', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const wallets = [];
    for (const cid of SUPPORTED_CHAINS) {
      wallets.push(await provisionUserAddress(pool, userId, cid));
    }
    res.json({ ok: true, wallet: wallets[0], wallets });
  } catch (err) {
    next(err);
  }
});

app.get('/wallet/balance', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const balance_wei = await getUserBalance(pool, userId);
    res.json({ ok: true, balance_wei, balance: ethers.formatEther(BigInt(balance_wei)) });
  } catch (err) {
    next(err);
  }
});

app.get('/wallet/transactions', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [depRows] = await pool.query(
      'SELECT chain_id, tx_hash, token_address, token_symbol, amount_wei, confirmations, status, created_at FROM wallet_deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    const ZERO = '0x0000000000000000000000000000000000000000';
    for (const row of depRows) {
      row.type = 'deposit';
      row.token_address = (row.token_address || ZERO).toLowerCase();
      const rawWei = row.amount_wei?.toString() ?? '0';
      row.amount_wei = rawWei.includes('.') ? rawWei.split('.')[0] : rawWei;
      row.amount_int = row.amount_wei;
      if (row.token_address === ZERO) {
        row.display_symbol = row.token_symbol || 'BNB';
        row.decimals = 18;
        row.amount = ethers.formatEther(BigInt(row.amount_wei));
      } else {
        const meta = tokenMeta[row.token_address];
        row.display_symbol = row.token_symbol || (meta ? meta.symbol : 'UNKNOWN');
        row.decimals = meta ? meta.decimals : 18;
        row.amount = row.amount_wei;
      }
      row.amount_formatted = formatUnitsStr(row.amount_wei, row.decimals);
    }

    const [trRows] = await pool.query(
      'SELECT from_user_id, to_user_id, asset, amount_wei, fee_wei, created_at FROM wallet_transfers WHERE from_user_id=? OR to_user_id=? ORDER BY created_at DESC LIMIT 50',
      [userId, userId]
    );
    const transfers = [];
    for (const row of trRows) {
      const incoming = row.to_user_id === userId;
      const meta = row.asset === 'BNB' || row.asset === 'ETH' ? { decimals: 18 } : tokenMetaBySymbol[row.asset];
      const decimals = meta ? meta.decimals : 18;
      const amtWei = BigInt(row.amount_wei);
      const feeWei = BigInt(row.fee_wei);
      const net = incoming ? amtWei - feeWei : amtWei;
      transfers.push({
        tx_hash: null,
        token_address: ZERO,
        token_symbol: row.asset,
        amount_wei: net.toString(),
        amount_int: net.toString(),
        display_symbol: row.asset,
        decimals,
        amount_formatted: formatUnitsStr(net.toString(), decimals),
        confirmations: 0,
        status: incoming ? 'received' : 'sent',
        created_at: row.created_at,
        type: 'transfer',
        direction: incoming ? 'in' : 'out',
        counterparty: incoming ? row.from_user_id : row.to_user_id,
      });
    }

    const allTx = [...depRows, ...transfers];
    allTx.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ ok: true, transactions: allTx.slice(0, 50) });
  } catch (err) {
    next(err);
  }
});

app.get('/wallet/assets', spotDataLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      'SELECT asset, balance_wei FROM user_balances WHERE user_id=?',
      [userId]
    );
    const assets = [];
    const symbolSet = new Set();
    for (const row of rows) {
      const sym = (row.asset || '').toUpperCase();
      if (!sym) continue;
      const meta = tokenMetaBySymbol[sym];
      const decimals = meta ? meta.decimals : 18;
      const contract = meta ? meta.contract : null;
      const chainId = meta?.chainId ?? DEFAULT_CHAIN_BY_SYMBOL[sym] ?? null;
      const rawWei = row.balance_wei?.toString() || '0';
      const wei = rawWei.includes('.') ? rawWei.split('.')[0] : rawWei;
      assets.push({
        symbol: sym,
        display_symbol: sym,
        contract,
        decimals,
        chain_id: chainId,
        balance_wei: wei,
        balance: formatUnitsStr(wei, decimals),
        last_movement_at: null,
        change_24h: '0',
        change_24h_percent: null,
        change_24h_wei: '0',
      });
      symbolSet.add(sym);
    }

    if (assets.length) {
      const symbols = Array.from(symbolSet);
      const placeholders = symbols.map(() => '?').join(',');

      let movementRows = [];
      if (placeholders.length) {
        const params = [userId, userId, userId, ...symbols];
        [movementRows] = await pool.query(
          `SELECT asset, MAX(created_at) AS last_movement
           FROM (
             SELECT UPPER(token_symbol) AS asset, created_at
             FROM wallet_deposits
             WHERE user_id = ? AND token_symbol IS NOT NULL AND token_symbol <> ''
             UNION ALL
             SELECT UPPER(asset) AS asset, created_at
             FROM wallet_transfers
             WHERE from_user_id = ? OR to_user_id = ?
           ) AS movements
           WHERE asset IN (${placeholders})
           GROUP BY asset`,
          params
        );
      }

      const movementMap = new Map();
      for (const row of movementRows) {
        const sym = (row.asset || '').toUpperCase();
        if (!sym || !row.last_movement) continue;
        movementMap.set(sym, new Date(row.last_movement).toISOString());
      }

      const changeMap = new Map();
      const recordChange = (asset, amount, sign = 1) => {
        const sym = (asset || '').toUpperCase();
        if (!sym || !symbolSet.has(sym)) return;
        const delta = bigIntFromValue(amount) * BigInt(sign);
        const current = changeMap.get(sym) || 0n;
        changeMap.set(sym, current + delta);
      };

      const sinceCondition = 'created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)';

      if (placeholders.length) {
        const [depositRows] = await pool.query(
          `SELECT UPPER(token_symbol) AS asset, SUM(amount_wei) AS total
           FROM wallet_deposits
           WHERE user_id=? AND token_symbol IS NOT NULL AND token_symbol <> '' AND ${sinceCondition}
           GROUP BY token_symbol`,
          [userId]
        );
        for (const row of depositRows) recordChange(row.asset, row.total, 1);

        const [transferInRows] = await pool.query(
          `SELECT UPPER(asset) AS asset, SUM(amount_wei - fee_wei) AS total
           FROM wallet_transfers
           WHERE to_user_id=? AND ${sinceCondition}
           GROUP BY asset`,
          [userId]
        );
        for (const row of transferInRows) recordChange(row.asset, row.total, 1);

        const [transferOutRows] = await pool.query(
          `SELECT UPPER(asset) AS asset, SUM(amount_wei) AS total
           FROM wallet_transfers
           WHERE from_user_id=? AND ${sinceCondition}
           GROUP BY asset`,
          [userId]
        );
        for (const row of transferOutRows) recordChange(row.asset, row.total, -1);
      }

      for (const asset of assets) {
        const sym = asset.symbol;
        asset.last_movement_at = movementMap.get(sym) || null;
        const changeWei = changeMap.get(sym) || 0n;
        asset.change_24h_wei = changeWei.toString();
        const changeDecimal = decimalFromWei(changeWei, asset.decimals);
        asset.change_24h = formatDecimalValue(changeDecimal, Math.min(6, asset.decimals));
        const balanceWei = bigIntFromValue(asset.balance_wei);
        const previousBalanceWei = balanceWei - changeWei;
        if (previousBalanceWei > 0n) {
          const previousDecimal = decimalFromWei(previousBalanceWei, asset.decimals);
          if (!previousDecimal.isZero()) {
            const percent = changeDecimal.div(previousDecimal).mul(100);
            asset.change_24h_percent = formatDecimalValue(percent, 2);
          } else {
            asset.change_24h_percent = null;
          }
        } else {
          asset.change_24h_percent = null;
        }
      }
    }

    res.json({ ok: true, assets });
  } catch (err) {
    next(err);
  }
});

app.get('/trade/markets', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    await syncSwapAssetPrices(pool);
    const [rows] = await pool.query(
      `SELECT UPPER(ap.asset) AS asset, ap.price_eltx, ap.min_amount, ap.max_amount, ap.spread_bps, ap.updated_at, ub.balance_wei,
              lp.asset_reserve_wei, lp.eltx_reserve_wei
       FROM asset_prices ap
       LEFT JOIN user_balances ub ON ub.user_id = ? AND UPPER(ub.asset) = UPPER(ap.asset)
       LEFT JOIN swap_liquidity_pools lp ON UPPER(lp.asset) = UPPER(ap.asset)
       WHERE UPPER(ap.asset) <> ?
       ORDER BY asset`,
      [userId, ELTX_SYMBOL]
    );
    const markets = rows.map((row) => {
      const symbol = (row.asset || '').toUpperCase();
      const decimals = getSymbolDecimals(symbol);
      const balanceRaw = row.balance_wei ? row.balance_wei.toString() : '0';
      const balanceWei = balanceRaw.includes('.') ? balanceRaw.split('.')[0] : balanceRaw;
      let priceStr = row.price_eltx?.toString() || '0';
      const assetReserve = bigIntFromValue(row.asset_reserve_wei);
      const eltxReserve = bigIntFromValue(row.eltx_reserve_wei);
      if (assetReserve > 0n && eltxReserve > 0n) {
        const priceWei = mulDiv(eltxReserve, PRICE_SCALE, assetReserve);
        priceStr = trimDecimal(formatUnitsStr(priceWei.toString(), 18));
      }
      const minStr = row.min_amount?.toString() || '0';
      const maxStr = row.max_amount?.toString() || null;
      const spread = row.spread_bps !== undefined && row.spread_bps !== null ? Number(row.spread_bps) : 0;
      return {
        asset: symbol,
        decimals,
        price_eltx: trimDecimal(priceStr),
        min_amount: trimDecimal(minStr),
        max_amount: maxStr ? trimDecimal(maxStr) : null,
        spread_bps: spread,
        updated_at: row.updated_at,
        balance_wei: balanceWei,
        balance: trimDecimal(formatUnitsStr(balanceWei, decimals)),
      };
    });
    const baseDecimals = getSymbolDecimals(ELTX_SYMBOL);
    res.json({
      ok: true,
      markets,
      baseAsset: { symbol: ELTX_SYMBOL, decimals: baseDecimals },
      pricing: { mode: 'internal' },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/wallet/transfer', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const fromUserId = await requireUser(req);
    const { to_user_id, asset, amount } = TransferSchema.parse(req.body);
    if (to_user_id === fromUserId) throw { status: 400, message: 'Cannot transfer to self' };
    const meta = asset === 'BNB' || asset === 'ETH' ? { decimals: 18 } : tokenMetaBySymbol[asset];
    if (!meta) throw { status: 400, message: 'Unsupported asset' };
    let amtWei;
    try {
      amtWei = ethers.parseUnits(amount, meta.decimals);
    } catch {
      throw { status: 400, message: 'Invalid amount' };
    }
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [target] = await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [to_user_id]);
    if (!target.length) throw { status: 404, message: 'User not found' };
    const [feeRows] = await conn.query("SELECT value FROM platform_settings WHERE name='transfer_fee_bps'");
    const feeBps = feeRows.length ? parseInt(feeRows[0].value, 10) || 0 : 0;
    const feeWei = (amtWei * BigInt(feeBps)) / 10000n;
    const recvAmt = amtWei - feeWei;
    const [balRows] = await conn.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=? FOR UPDATE',
      [fromUserId, asset]
    );
    const bal = balRows.length ? BigInt(balRows[0].balance_wei) : 0n;
    if (bal < amtWei) throw { status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' };
    await conn.query('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND asset=?', [amtWei.toString(), fromUserId, asset]);
    await conn.query(
      'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
      [to_user_id, asset, recvAmt.toString()]
    );
    await conn.query('INSERT INTO wallet_transfers (from_user_id, to_user_id, asset, amount_wei, fee_wei) VALUES (?,?,?,?,?)', [fromUserId, to_user_id, asset, amtWei.toString(), feeWei.toString()]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/trade/quote', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const { asset: rawAsset, amount } = TradeQuoteSchema.parse(req.body);
    const asset = rawAsset.trim().toUpperCase();
    if (asset === ELTX_SYMBOL)
      return next({ status: 400, code: 'INVALID_ASSET', message: 'Cannot swap ELTX to itself' });

    await syncSwapAssetPrices(pool);

    if (!isSupportedSwapAsset(asset))
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });

    const [[priceRow]] = await pool.query(
      'SELECT UPPER(asset) AS asset, price_eltx, min_amount, max_amount, spread_bps FROM asset_prices WHERE UPPER(asset)=?',
      [asset]
    );
    if (!priceRow)
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });

    const assetDecimals = getSymbolDecimals(asset);
    const targetDecimals = getSymbolDecimals(ELTX_SYMBOL);
    let amountWei;
    try {
      amountWei = ethers.parseUnits(amount, assetDecimals);
    } catch {
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Invalid amount' });
    }
    if (amountWei <= 0n)
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be greater than zero' });

    const minAmountStr = priceRow.min_amount?.toString() || '0';
    if (!isZeroDecimal(minAmountStr)) {
      const minWei = ethers.parseUnits(minAmountStr, assetDecimals);
      if (amountWei < minWei)
        return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount below minimum' });
    }

    const maxAmountStr = priceRow.max_amount?.toString() || null;
    if (maxAmountStr && !isZeroDecimal(maxAmountStr)) {
      const maxWei = ethers.parseUnits(maxAmountStr, assetDecimals);
      if (amountWei > maxWei)
        return next({ status: 400, code: 'AMOUNT_TOO_LARGE', message: 'Amount exceeds maximum' });
    }

    const [[balanceRow]] = await pool.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=?',
      [userId, asset]
    );
    let balanceWei = 0n;
    if (balanceRow) balanceWei = bigIntFromValue(balanceRow.balance_wei);
    if (balanceWei < amountWei)
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });

    const config = getSwapAssetConfig(asset);
    const spreadBps = priceRow.spread_bps !== undefined && priceRow.spread_bps !== null ? Number(priceRow.spread_bps) : 0;
    let grossEltxWei = 0n;
    let priceWei = 0n;
    let priceStr = priceRow.price_eltx?.toString() || '0';

    let pricingMode = getSwapPricingMode(asset);
    let poolRow = null;
    if (pricingMode !== 'oracle') {
      poolRow = await getSwapPoolRow(pool, asset);
      pricingMode = getSwapPricingMode(asset, { hasPool: !!poolRow });
    }

    if (pricingMode === 'unsupported')
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });

    if (pricingMode === 'pool') {
      if (!poolRow)
        return next({ status: 400, code: 'POOL_UNAVAILABLE', message: 'No liquidity available for this asset' });
      const assetReserve = bigIntFromValue(poolRow.asset_reserve_wei);
      const eltxReserve = bigIntFromValue(poolRow.eltx_reserve_wei);
      if (assetReserve <= 0n || eltxReserve <= 0n)
        return next({ status: 400, code: 'POOL_EMPTY', message: 'Liquidity pool is empty' });

      grossEltxWei = mulDiv(amountWei, eltxReserve, assetReserve);
      if (spreadBps >= 10000)
        return next({ status: 500, code: 'INVALID_SPREAD', message: 'Pricing configuration invalid' });
      if (spreadBps > 0) grossEltxWei = (grossEltxWei * (10000n - BigInt(spreadBps))) / 10000n;
      if (grossEltxWei <= 0n)
        return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount too small to convert' });
      if (grossEltxWei >= eltxReserve)
        return next({ status: 400, code: 'INSUFFICIENT_LIQUIDITY', message: 'Liquidity insufficient for this swap' });

      priceWei = mulDiv(grossEltxWei, PRICE_SCALE, amountWei);
      priceStr = trimDecimal(formatUnitsStr(priceWei.toString(), 18));
    } else {
      if (!config)
        return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });
      if (isZeroDecimal(priceStr))
        return next({ status: 503, code: 'PRICING_UNAVAILABLE', message: 'Pricing temporarily unavailable' });
      try {
        priceWei = ethers.parseUnits(priceStr, 18);
      } catch (err) {
        return next({ status: 500, code: 'INVALID_PRICE', message: 'Pricing data invalid' });
      }
      if (priceWei <= 0n)
        return next({ status: 503, code: 'PRICING_UNAVAILABLE', message: 'Pricing temporarily unavailable' });
      grossEltxWei = mulDiv(amountWei, priceWei, PRICE_SCALE);
      if (spreadBps >= 10000)
        return next({ status: 500, code: 'INVALID_SPREAD', message: 'Pricing configuration invalid' });
      if (spreadBps > 0) grossEltxWei = (grossEltxWei * (10000n - BigInt(spreadBps))) / 10000n;
      if (grossEltxWei <= 0n)
        return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount too small to convert' });
    }

    let swapFeeBps = 0n;
    try {
      const feeVal = await getPlatformSettingValue('swap_fee_bps', '0');
      swapFeeBps = BigInt(Number.parseInt(feeVal, 10) || 0);
      if (swapFeeBps < 0n) swapFeeBps = 0n;
      if (swapFeeBps > 10000n) swapFeeBps = 10000n;
    } catch {}
    let feeWei = (grossEltxWei * swapFeeBps) / 10000n;
    if (feeWei > grossEltxWei) feeWei = grossEltxWei;
    const netEltxWei = grossEltxWei - feeWei;
    if (netEltxWei <= 0n)
      return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount too small after fees' });

    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
    const quoteId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO trade_quotes (id, user_id, asset, asset_decimals, target_decimals, asset_amount_wei, eltx_amount_wei, price_eltx, price_wei, spread_bps, fee_bps, fee_asset, fee_amount_wei, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        quoteId,
        userId,
        asset,
        assetDecimals,
        targetDecimals,
        amountWei.toString(),
        netEltxWei.toString(),
        priceStr,
        priceWei.toString(),
        spreadBps,
        Number(swapFeeBps),
        ELTX_SYMBOL,
        feeWei.toString(),
        expiresAt,
      ]
    );

    res.json({
      ok: true,
      quote: {
        id: quoteId,
        asset,
        asset_decimals: assetDecimals,
        target_decimals: targetDecimals,
        amount: trimDecimal(formatUnitsStr(amountWei.toString(), assetDecimals)),
        amount_wei: amountWei.toString(),
        eltx_amount: trimDecimal(formatUnitsStr(netEltxWei.toString(), targetDecimals)),
        eltx_amount_wei: netEltxWei.toString(),
        price_eltx: priceStr,
        rate: trimDecimal(formatUnitsStr(priceWei.toString(), 18)),
        spread_bps: spreadBps,
        fee_bps: Number(swapFeeBps),
        fee_asset: ELTX_SYMBOL,
        fee_amount: trimDecimal(formatUnitsStr(feeWei.toString(), targetDecimals)),
        fee_amount_wei: feeWei.toString(),
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/trade/execute', walletLimiter, async (req, res, next) => {
  let conn;
  let quoteRow;
  try {
    const userId = await requireUser(req);
    const { quote_id } = TradeExecuteSchema.parse(req.body);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT id, user_id, asset, asset_decimals, target_decimals, asset_amount_wei, eltx_amount_wei, price_wei, spread_bps, fee_bps, fee_asset, fee_amount_wei, status, expires_at FROM trade_quotes WHERE id=? FOR UPDATE',
      [quote_id]
    );
    if (!rows.length) {
      await conn.rollback();
      return next({ status: 404, code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    }
    quoteRow = rows[0];
    if (quoteRow.user_id !== userId) {
      await conn.rollback();
      return next({ status: 404, code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    }
    if (quoteRow.status !== 'pending') {
      await conn.rollback();
      return next({ status: 400, code: 'QUOTE_INACTIVE', message: 'Quote no longer available' });
    }

    const expiresAt = quoteRow.expires_at instanceof Date ? quoteRow.expires_at : new Date(quoteRow.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      await conn.query('UPDATE trade_quotes SET status="expired", executed_at=NOW() WHERE id=?', [quote_id]);
      await conn.commit();
      return next({ status: 400, code: 'QUOTE_EXPIRED', message: 'Quote expired' });
    }

    const asset = (quoteRow.asset || '').toUpperCase();
    const assetDecimals = quoteRow.asset_decimals || getSymbolDecimals(asset);
    const targetDecimals = quoteRow.target_decimals || getSymbolDecimals(ELTX_SYMBOL);
    const amountWei = BigInt(quoteRow.asset_amount_wei);
    const eltxWei = BigInt(quoteRow.eltx_amount_wei);
    const feeWei = bigIntFromValue(quoteRow.fee_amount_wei);
    const grossEltxWei = eltxWei + feeWei;
    const priceWei = BigInt(quoteRow.price_wei);

    const [balRows] = await conn.query(
      'SELECT asset, balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
      [userId, asset]
    );
    let balanceWei = 0n;
    if (balRows.length) {
      const balRaw = balRows[0].balance_wei?.toString() || '0';
      const normalized = balRaw.includes('.') ? balRaw.split('.')[0] : balRaw;
      balanceWei = BigInt(normalized);
    }
    if (balanceWei < amountWei) {
      await conn.rollback();
      await pool.query('UPDATE trade_quotes SET status="failed", executed_at=NOW() WHERE id=?', [quote_id]);
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }

    let pricingMode = getSwapPricingMode(asset);
    let poolRow = null;
    if (pricingMode !== 'oracle') {
      poolRow = await getSwapPoolRow(conn, asset, { forUpdate: true });
      pricingMode = getSwapPricingMode(asset, { hasPool: !!poolRow });
    }

    if (pricingMode === 'unsupported') {
      await conn.rollback();
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });
    }

    if (pricingMode === 'pool') {
      if (!poolRow) {
        await conn.rollback();
        return next({ status: 400, code: 'POOL_UNAVAILABLE', message: 'No liquidity available for this asset' });
      }
      const assetReserve = bigIntFromValue(poolRow.asset_reserve_wei);
      const eltxReserve = bigIntFromValue(poolRow.eltx_reserve_wei);
      if (eltxReserve < grossEltxWei) {
        await conn.rollback();
        return next({ status: 400, code: 'POOL_EMPTY', message: 'Liquidity insufficient to settle quote' });
      }

      const newAssetReserve = assetReserve + amountWei;
      const newEltxReserve = eltxReserve - grossEltxWei;

      await updateSwapPool(conn, asset, newAssetReserve, newEltxReserve);

      if (newAssetReserve > 0n && newEltxReserve > 0n) {
        const newPriceWei = mulDiv(newEltxReserve, PRICE_SCALE, newAssetReserve);
        const newPriceStr = trimDecimal(formatUnitsStr(newPriceWei.toString(), 18));
        await conn.query('UPDATE asset_prices SET price_eltx=? WHERE UPPER(asset)=?', [newPriceStr, asset]);
      }
    }

    await conn.query(
      'UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?',
      [amountWei.toString(), userId, asset]
    );
    await conn.query(
      'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
      [userId, ELTX_SYMBOL, eltxWei.toString()]
    );
    await conn.query(
      'INSERT INTO trade_swaps (quote_id, user_id, asset, asset_decimals, target_decimals, asset_amount_wei, eltx_amount_wei, price_wei, gross_eltx_amount_wei, fee_asset, fee_amount_wei) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [
        quote_id,
        userId,
        asset,
        assetDecimals,
        targetDecimals,
        amountWei.toString(),
        eltxWei.toString(),
        priceWei.toString(),
        grossEltxWei.toString(),
        ELTX_SYMBOL,
        feeWei.toString(),
      ]
    );
    if (feeWei > 0n) {
      await conn.query('INSERT INTO platform_fees (fee_type, reference, asset, amount_wei) VALUES (?,?,?,?)', [
        'swap',
        quote_id,
        ELTX_SYMBOL,
        feeWei.toString(),
      ]);
    }
    await conn.query('UPDATE trade_quotes SET status="completed", executed_at=NOW() WHERE id=?', [quote_id]);
    await conn.commit();

    res.json({
      ok: true,
      swap: {
        quote_id,
        asset,
        amount: trimDecimal(formatUnitsStr(amountWei.toString(), assetDecimals)),
        amount_wei: amountWei.toString(),
        eltx_amount: trimDecimal(formatUnitsStr(eltxWei.toString(), targetDecimals)),
        eltx_amount_wei: eltxWei.toString(),
        rate: trimDecimal(formatUnitsStr(priceWei.toString(), 18)),
        spread_bps: quoteRow.spread_bps !== undefined && quoteRow.spread_bps !== null ? Number(quoteRow.spread_bps) : 0,
        fee_bps: quoteRow.fee_bps !== undefined && quoteRow.fee_bps !== null ? Number(quoteRow.fee_bps) : 0,
        fee_asset: quoteRow.fee_asset || ELTX_SYMBOL,
        fee_amount: trimDecimal(formatUnitsStr(feeWei.toString(), targetDecimals)),
        fee_amount_wei: feeWei.toString(),
      },
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/spot/markets', spotDataLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const [rows] = await pool.query(
      `SELECT sm.id, sm.symbol, sm.base_asset, sm.base_decimals, sm.quote_asset, sm.quote_decimals, sm.min_base_amount, sm.min_quote_amount,
              sm.price_precision, sm.amount_precision, sm.active,
              (SELECT price_wei FROM spot_trades WHERE market_id = sm.id ORDER BY id DESC LIMIT 1) AS last_price_wei
       FROM spot_markets sm
       WHERE sm.active = 1
       ORDER BY sm.symbol`
    );
    let feeSetting = '0';
    try {
      feeSetting = await getPlatformSettingValue('spot_trade_fee_bps', '0');
    } catch {}
    const feeBps = Number.parseInt(feeSetting, 10);
    const normalizedFeeBps = Number.isFinite(feeBps) ? feeBps : 0;
    const markets = rows.map((row) => {
      const lastPriceWei = bigIntFromValue(row.last_price_wei);
      return {
        id: row.id,
        symbol: row.symbol,
        base_asset: row.base_asset,
        base_decimals: row.base_decimals,
        quote_asset: row.quote_asset,
        quote_decimals: row.quote_decimals,
        min_base_amount: trimDecimal(row.min_base_amount),
        min_quote_amount: trimDecimal(row.min_quote_amount),
        price_precision: row.price_precision,
        amount_precision: row.amount_precision,
        last_price: lastPriceWei > 0n ? trimDecimal(formatUnitsStr(lastPriceWei.toString(), 18)) : null,
      };
    });
    res.json({
      ok: true,
      markets,
      fees: { maker_bps: normalizedFeeBps, taker_bps: normalizedFeeBps },
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/orderbook', spotDataLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const { market } = SpotOrderbookSchema.parse({ market: req.query.market });
    const marketRow = await getSpotMarket(pool, market);
    if (!marketRow || !marketRow.active)
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });

    const [bidRows] = await pool.query(
      `SELECT price_wei, SUM(remaining_base_wei) AS base_total
       FROM spot_orders
       WHERE market_id=? AND status='open' AND side='buy'
       GROUP BY price_wei
       ORDER BY price_wei DESC
       LIMIT 50`,
      [marketRow.id]
    );
    const [askRows] = await pool.query(
      `SELECT price_wei, SUM(remaining_base_wei) AS base_total
       FROM spot_orders
       WHERE market_id=? AND status='open' AND side='sell'
       GROUP BY price_wei
       ORDER BY price_wei ASC
       LIMIT 50`,
      [marketRow.id]
    );
    const formatLevel = (row) => {
      const priceWei = BigInt(row.price_wei);
      const baseWei = bigIntFromValue(row.base_total);
      const quoteWei = computeQuoteAmount(baseWei, priceWei);
      return {
        price: trimDecimal(formatUnitsStr(priceWei.toString(), 18)),
        price_wei: priceWei.toString(),
        base_amount: trimDecimal(formatUnitsStr(baseWei.toString(), marketRow.base_decimals)),
        base_amount_wei: baseWei.toString(),
        quote_amount: trimDecimal(formatUnitsStr(quoteWei.toString(), marketRow.quote_decimals)),
        quote_amount_wei: quoteWei.toString(),
      };
    };

    const [tradeRows] = await pool.query(
      `SELECT id, price_wei, base_amount_wei, quote_amount_wei, taker_side, created_at
       FROM spot_trades
       WHERE market_id=?
       ORDER BY id DESC
       LIMIT 50`,
      [marketRow.id]
    );
    const trades = tradeRows.map((row) => ({
      id: row.id,
      price: trimDecimal(formatUnitsStr(row.price_wei.toString(), 18)),
      price_wei: row.price_wei?.toString() || '0',
      base_amount: trimDecimal(formatUnitsStr(row.base_amount_wei.toString(), marketRow.base_decimals)),
      base_amount_wei: row.base_amount_wei?.toString() || '0',
      quote_amount: trimDecimal(formatUnitsStr(row.quote_amount_wei.toString(), marketRow.quote_decimals)),
      quote_amount_wei: row.quote_amount_wei?.toString() || '0',
      taker_side: row.taker_side,
      created_at: row.created_at,
    }));

    res.json({
      ok: true,
      market: {
        symbol: marketRow.symbol,
        base_asset: marketRow.base_asset,
        quote_asset: marketRow.quote_asset,
      },
      orderbook: {
        bids: bidRows.map(formatLevel),
        asks: askRows.map(formatLevel),
      },
      trades,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/candles', spotDataLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const query = {
      market: req.query.market,
      interval: req.query.interval,
      limit: req.query.limit,
    };
    const { market, interval, limit } = SpotCandlesQuerySchema.parse(query);
    const marketRow = await getSpotMarket(pool, market);
    if (!marketRow || !marketRow.active)
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });

    const intervalInfo = CANDLE_INTERVALS[interval];
    if (!intervalInfo)
      return next({ status: 400, code: 'UNSUPPORTED_INTERVAL', message: 'Unsupported interval' });

    const intervalSeconds = intervalInfo.seconds;
    const maxPoints = limit;
    const sinceDate = new Date(Date.now() - intervalSeconds * maxPoints * 1000);
    const fetchLimit = Math.min(maxPoints * 3, 1500);

    const [tradeRows] = await pool.query(
      `SELECT price_wei, base_amount_wei, created_at
       FROM spot_trades
       WHERE market_id=? AND created_at >= ?
       ORDER BY created_at ASC
       LIMIT ?`,
      [marketRow.id, sinceDate, fetchLimit]
    );

    if (!tradeRows.length)
      return res.json({
        ok: true,
        market: { symbol: marketRow.symbol, base_asset: marketRow.base_asset, quote_asset: marketRow.quote_asset },
        interval,
        candles: [],
      });

    const pricePlaces = Math.min(8, Number(marketRow.price_precision || 8));
    const amountPlaces = Math.min(8, Number(marketRow.amount_precision || 8));
    const bucketMap = new Map();

    for (const row of tradeRows) {
      const createdAt = new Date(row.created_at);
      const timestamp = Math.floor(createdAt.getTime() / 1000);
      if (!Number.isFinite(timestamp)) continue;
      const bucketStart = Math.floor(timestamp / intervalSeconds) * intervalSeconds;

      const priceDecimal = decimalFromWei(row.price_wei?.toString() || '0', 18);
      if (!priceDecimal.isFinite() || priceDecimal.isZero()) continue;
      const volumeDecimal = decimalFromWei(row.base_amount_wei?.toString() || '0', marketRow.base_decimals);

      if (!bucketMap.has(bucketStart)) {
        bucketMap.set(bucketStart, {
          time: bucketStart,
          open: priceDecimal,
          high: priceDecimal,
          low: priceDecimal,
          close: priceDecimal,
          volume: volumeDecimal,
        });
      } else {
        const bucket = bucketMap.get(bucketStart);
        bucket.close = priceDecimal;
        if (priceDecimal.gt(bucket.high)) bucket.high = priceDecimal;
        if (priceDecimal.lt(bucket.low)) bucket.low = priceDecimal;
        bucket.volume = bucket.volume.add(volumeDecimal);
      }
    }

    const candles = Array.from(bucketMap.values())
      .sort((a, b) => a.time - b.time)
      .slice(-maxPoints)
      .map((bucket) => ({
        time: bucket.time,
        open: formatDecimalValue(bucket.open, pricePlaces),
        high: formatDecimalValue(bucket.high, pricePlaces),
        low: formatDecimalValue(bucket.low, pricePlaces),
        close: formatDecimalValue(bucket.close, pricePlaces),
        volume: formatDecimalValue(bucket.volume, amountPlaces),
      }));

    res.json({
      ok: true,
      market: { symbol: marketRow.symbol, base_asset: marketRow.base_asset, quote_asset: marketRow.quote_asset },
      interval,
      candles,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/orders', spotDataLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const { market } = SpotOrdersQuerySchema.parse({ market: req.query.market });
    let marketRow = null;
    const orderParams = [userId];
    let marketFilter = '';
    if (market) {
      marketRow = await getSpotMarket(pool, market);
      if (!marketRow)
        return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });
      marketFilter = 'AND so.market_id = ?';
      orderParams.push(marketRow.id);
    }

    const [orderRows] = await pool.query(
      `SELECT so.*, sm.symbol, sm.base_asset, sm.quote_asset, sm.base_decimals, sm.quote_decimals
       FROM spot_orders so
       JOIN spot_markets sm ON sm.id = so.market_id
       WHERE so.user_id = ? ${marketFilter}
       ORDER BY FIELD(so.status,'open','filled','cancelled'), so.id DESC
       LIMIT 100`,
      orderParams
    );
    const orders = orderRows.map((row) => {
      const baseDecimals = row.base_decimals;
      const quoteDecimals = row.quote_decimals;
      const priceWei = BigInt(row.price_wei || 0);
      const baseWei = bigIntFromValue(row.base_amount_wei);
      const remainingBaseWei = bigIntFromValue(row.remaining_base_wei);
      const quoteWei = bigIntFromValue(row.quote_amount_wei);
      const remainingQuoteWei = bigIntFromValue(row.remaining_quote_wei);
      return {
        id: row.id,
        market: row.symbol,
        side: row.side,
        type: row.type,
        status: row.status,
        price: priceWei > 0n ? trimDecimal(formatUnitsStr(priceWei.toString(), 18)) : null,
        price_wei: priceWei.toString(),
        base_amount: trimDecimal(formatUnitsStr(baseWei.toString(), baseDecimals)),
        base_amount_wei: baseWei.toString(),
        remaining_base_amount: trimDecimal(formatUnitsStr(remainingBaseWei.toString(), baseDecimals)),
        remaining_base_wei: remainingBaseWei.toString(),
        quote_amount: trimDecimal(formatUnitsStr(quoteWei.toString(), quoteDecimals)),
        quote_amount_wei: quoteWei.toString(),
        remaining_quote_amount: trimDecimal(formatUnitsStr(remainingQuoteWei.toString(), quoteDecimals)),
        remaining_quote_wei: remainingQuoteWei.toString(),
        fee_bps: row.fee_bps,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    const tradeParamsBuy = [userId];
    if (marketRow) tradeParamsBuy.push(marketRow.id);
    const [buyTrades] = await pool.query(
      `SELECT st.id, st.market_id, st.price_wei, st.base_amount_wei, st.quote_amount_wei, st.buy_fee_wei AS fee_wei, st.taker_side, st.created_at, sm.symbol
       FROM spot_trades st
       JOIN spot_orders so ON so.id = st.buy_order_id
       JOIN spot_markets sm ON sm.id = st.market_id
       WHERE so.user_id = ? ${marketRow ? 'AND st.market_id = ?' : ''}
       ORDER BY st.id DESC
       LIMIT 100`,
      tradeParamsBuy
    );

    const tradeParamsSell = [userId];
    if (marketRow) tradeParamsSell.push(marketRow.id);
    const [sellTrades] = await pool.query(
      `SELECT st.id, st.market_id, st.price_wei, st.base_amount_wei, st.quote_amount_wei, st.sell_fee_wei AS fee_wei, st.taker_side, st.created_at, sm.symbol
       FROM spot_trades st
       JOIN spot_orders so ON so.id = st.sell_order_id
       JOIN spot_markets sm ON sm.id = st.market_id
       WHERE so.user_id = ? ${marketRow ? 'AND st.market_id = ?' : ''}
       ORDER BY st.id DESC
       LIMIT 100`,
      tradeParamsSell
    );

    const combinedTrades = [
      ...buyTrades.map((row) => ({ ...row, role: 'buy' })),
      ...sellTrades.map((row) => ({ ...row, role: 'sell' })),
    ];
    combinedTrades.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
    const limitedSource = combinedTrades.slice(0, 100);
    const marketInfoCache = new Map();
    const limitedTrades = [];
    for (const row of limitedSource) {
      let info = marketInfoCache.get(row.symbol);
      if (!info) {
        info = await getSpotMarket(pool, row.symbol);
        marketInfoCache.set(row.symbol, info);
      }
      const baseDecimals = info ? info.base_decimals : marketRow?.base_decimals || 18;
      const quoteDecimals = info ? info.quote_decimals : marketRow?.quote_decimals || 18;
      limitedTrades.push({
        id: row.id,
        market: row.symbol,
        role: row.role,
        price: trimDecimal(formatUnitsStr(row.price_wei.toString(), 18)),
        price_wei: row.price_wei?.toString() || '0',
        base_amount: trimDecimal(formatUnitsStr(row.base_amount_wei.toString(), baseDecimals)),
        base_amount_wei: row.base_amount_wei?.toString() || '0',
        quote_amount: trimDecimal(formatUnitsStr(row.quote_amount_wei.toString(), quoteDecimals)),
        quote_amount_wei: row.quote_amount_wei?.toString() || '0',
        fee_wei: row.fee_wei?.toString() || '0',
        taker_side: row.taker_side,
        created_at: row.created_at,
      });
    }

    res.json({ ok: true, orders, trades: limitedTrades });
  } catch (err) {
    next(err);
  }
});

app.post('/spot/orders', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const { market: rawMarket, side, type, amount, price } = SpotOrderSchema.parse(req.body);
    const marketSymbol = normalizeMarketSymbol(rawMarket);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const market = await getSpotMarket(conn, marketSymbol, { forUpdate: true });
    if (!market || !market.active) {
      await conn.rollback();
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not available' });
    }

    const baseDecimals = market.base_decimals;
    const quoteDecimals = market.quote_decimals;
    let amountWei;
    try {
      amountWei = ethers.parseUnits(amount, baseDecimals);
    } catch {
      await conn.rollback();
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Invalid amount' });
    }
    if (amountWei <= 0n) {
      await conn.rollback();
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be greater than zero' });
    }

    if (market.min_base_amount && !isZeroDecimal(market.min_base_amount)) {
      const minBaseWei = ethers.parseUnits(market.min_base_amount.toString(), baseDecimals);
      if (amountWei < minBaseWei) {
        await conn.rollback();
        return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount below minimum' });
      }
    }

    let priceWei = 0n;
    if (type === 'limit') {
      if (!price) {
        await conn.rollback();
        return next({ status: 400, code: 'PRICE_REQUIRED', message: 'Price required for limit orders' });
      }
      try {
        priceWei = ethers.parseUnits(price, 18);
      } catch {
        await conn.rollback();
        return next({ status: 400, code: 'INVALID_PRICE', message: 'Invalid price' });
      }
      if (priceWei <= 0n) {
        await conn.rollback();
        return next({ status: 400, code: 'INVALID_PRICE', message: 'Price must be greater than zero' });
      }
    }

    let feeBps = 0n;
    try {
      const feeVal = await getPlatformSettingValue('spot_trade_fee_bps', '0', conn);
      feeBps = clampBps(BigInt(Number.parseInt(feeVal, 10) || 0));
    } catch {}

    const baseAsset = market.base_asset;
    const quoteAsset = market.quote_asset;

    let quoteBalance = 0n;
    let baseBalance = 0n;
    if (side === 'buy') {
      const [rows] = await conn.query(
        'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
        [userId, quoteAsset]
      );
      quoteBalance = rows.length ? bigIntFromValue(rows[0].balance_wei) : 0n;
    } else {
      const [rows] = await conn.query(
        'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
        [userId, baseAsset]
      );
      baseBalance = rows.length ? bigIntFromValue(rows[0].balance_wei) : 0n;
    }

    let reservedQuote = 0n;
    let availableQuote = quoteBalance;
    if (side === 'buy') {
      if (type === 'limit') {
        const quoteWithoutFee = computeQuoteAmount(amountWei, priceWei);
        const feeAmount = (quoteWithoutFee * feeBps) / 10000n;
        reservedQuote = quoteWithoutFee + feeAmount;
        if (quoteBalance < reservedQuote) {
          await conn.rollback();
          return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient quote balance' });
        }
        await conn.query('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?', [
          reservedQuote.toString(),
          userId,
          quoteAsset,
        ]);
        availableQuote = reservedQuote;
      } else {
        if (quoteBalance <= 0n) {
          await conn.rollback();
          return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient quote balance' });
        }
        availableQuote = quoteBalance;
      }
    } else {
      if (baseBalance < amountWei) {
        await conn.rollback();
        return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient base balance' });
      }
      await conn.query('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?', [
        amountWei.toString(),
        userId,
        baseAsset,
      ]);
    }

    const [insert] = await conn.query(
      'INSERT INTO spot_orders (market_id, user_id, side, type, price_wei, base_amount_wei, quote_amount_wei, remaining_base_wei, remaining_quote_wei, fee_bps, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [
        market.id,
        userId,
        side,
        type,
        priceWei.toString(),
        amountWei.toString(),
        side === 'buy' && type === 'limit' ? reservedQuote.toString() : '0',
        amountWei.toString(),
        side === 'buy' && type === 'limit' ? reservedQuote.toString() : '0',
        Number(feeBps),
        'open',
      ]
    );
    const orderId = insert.insertId;

    const taker = {
      id: orderId,
      userId,
      side,
      type,
      priceWei,
      remainingBase: amountWei,
      remainingQuote: side === 'buy' && type === 'limit' ? reservedQuote : 0n,
      availableQuote,
      feeBps,
    };

    const matchResult = await matchSpotOrder(conn, market, taker);

    let orderStatus = 'open';
    if (taker.remainingBase <= 0n) orderStatus = 'filled';
    if (type === 'market') {
      if (matchResult.filledBase > 0n) orderStatus = 'filled';
      else orderStatus = 'cancelled';
    }

    let remainingQuote = taker.remainingQuote;
    let quoteAmountRecord = side === 'buy' && type === 'limit' ? reservedQuote : matchResult.spentQuote;

    if (side === 'buy') {
      if (matchResult.receivedBase > 0n) {
        await conn.query(
          'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
          [userId, baseAsset, matchResult.receivedBase.toString()]
        );
      }
      if (type === 'market') {
        if (matchResult.spentQuote > 0n) {
          if (quoteBalance < matchResult.spentQuote) {
            await conn.rollback();
            return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient quote balance' });
          }
          await conn.query('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?', [
            matchResult.spentQuote.toString(),
            userId,
            quoteAsset,
          ]);
        }
        remainingQuote = 0n;
      } else if (orderStatus !== 'open' && remainingQuote > 0n) {
        await conn.query(
          'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
          [userId, quoteAsset, remainingQuote.toString()]
        );
        remainingQuote = 0n;
      }
    } else {
      const leftoverBase = amountWei - matchResult.filledBase;
      if (leftoverBase > 0n) {
        await conn.query(
          'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
          [userId, baseAsset, leftoverBase.toString()]
        );
      }
      if (matchResult.receivedQuote > 0n) {
        await conn.query(
          'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
          [userId, quoteAsset, matchResult.receivedQuote.toString()]
        );
      }
      quoteAmountRecord = matchResult.receivedQuote + matchResult.takerFee;
    }

    await conn.query('UPDATE spot_orders SET remaining_base_wei=?, remaining_quote_wei=?, status=?, quote_amount_wei=? WHERE id=?', [
      taker.remainingBase.toString(),
      remainingQuote.toString(),
      orderStatus,
      quoteAmountRecord.toString(),
      orderId,
    ]);

    await conn.commit();

    const trades = matchResult.trades.map((trade) => ({
      trade_id: trade.trade_id,
      maker_order_id: trade.maker_order_id,
      price: trimDecimal(formatUnitsStr(trade.price_wei.toString(), 18)),
      price_wei: trade.price_wei.toString(),
      base_amount: trimDecimal(formatUnitsStr(trade.base_amount_wei.toString(), baseDecimals)),
      base_amount_wei: trade.base_amount_wei.toString(),
      quote_amount: trimDecimal(formatUnitsStr(trade.quote_amount_wei.toString(), quoteDecimals)),
      quote_amount_wei: trade.quote_amount_wei.toString(),
      taker_fee_wei: trade.taker_fee_wei.toString(),
      maker_fee_wei: trade.maker_fee_wei.toString(),
    }));

    res.json({
      ok: true,
      order: {
        id: orderId,
        status: orderStatus,
        remaining_base_wei: taker.remainingBase.toString(),
        remaining_quote_wei: remainingQuote.toString(),
        filled_base_wei: matchResult.filledBase.toString(),
        filled_base: trimDecimal(formatUnitsStr(matchResult.filledBase.toString(), baseDecimals)),
        average_price: matchResult.averagePriceWei > 0n ? trimDecimal(formatUnitsStr(matchResult.averagePriceWei.toString(), 18)) : null,
      },
      trades,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/spot/orders/:id/cancel', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(orderId)) return next({ status: 400, code: 'INVALID_ORDER', message: 'Invalid order id' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT so.*, sm.base_asset, sm.quote_asset, sm.base_decimals, sm.quote_decimals
       FROM spot_orders so
       JOIN spot_markets sm ON sm.id = so.market_id
       WHERE so.id=? AND so.user_id=? FOR UPDATE`,
      [orderId, userId]
    );
    if (!rows.length) {
      await conn.rollback();
      return next({ status: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    const order = rows[0];
    if (order.status !== 'open') {
      await conn.rollback();
      return next({ status: 400, code: 'ORDER_NOT_OPEN', message: 'Order is not open' });
    }

    const baseAsset = order.base_asset;
    const quoteAsset = order.quote_asset;
    const remainingBase = bigIntFromValue(order.remaining_base_wei);
    const remainingQuote = bigIntFromValue(order.remaining_quote_wei);

    if (order.side === 'buy' && remainingQuote > 0n) {
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
        [userId, quoteAsset, remainingQuote.toString()]
      );
    }
    if (order.side === 'sell' && remainingBase > 0n) {
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
        [userId, baseAsset, remainingBase.toString()]
      );
    }

    await conn.query('UPDATE spot_orders SET status="cancelled", remaining_base_wei=0, remaining_quote_wei=0 WHERE id=?', [orderId]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/wallet/refresh', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const wallet = await provisionUserAddress(pool, userId, CHAIN_ID);
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || process.env.RPC_HTTP, CHAIN_ID);
    const bal = await provider.getBalance(wallet.address);
    await pool.query(
      "INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,'BNB',?) ON DUPLICATE KEY UPDATE balance_wei=VALUES(balance_wei)",
      [userId, bal.toString()]
    );
    res.json({ ok: true, balance_wei: bal.toString(), balance: ethers.formatEther(bal) });
  } catch (err) {
    next(err);
  }
});

// On-demand wallet scan endpoints
const { getLatestBlockNumber } = require('./src/services/bscRpc');
const { enqueueUserScan, getJobStatus } = require('./src/services/scanJobs');
const { getLastScannedBlock } = require('./src/services/userScanProgress');

app.post('/api/wallet/refresh', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const latest = await getLatestBlockNumber();
    const N = Number(process.env.USER_SCAN_RECENT_BLOCKS) || 1000;
    const baseline = latest - N + 1;
    const last = await getLastScannedBlock(pool, userId);
    const fromBlock = Math.max(baseline, last ? last + 1 : baseline);
    const toBlock = latest;
    const jobId = await enqueueUserScan(pool, userId, fromBlock, toBlock);
    console.log(`[wallet/refresh] user=${userId} range=${fromBlock}-${toBlock} job=${jobId}`);
    res.status(202).json({
      ok: true,
      status: 202,
      jobId,
      range: { from: fromBlock, to: toBlock },
      message: 'Scanning recent blocks in background (snapshot)',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/wallet/refresh/:jobId', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    console.log(`[wallet/refresh] status check user=${userId} job=${req.params.jobId}`);
    const job = await getJobStatus(pool, req.params.jobId, userId);
    if (!job) return next({ status: 404, code: 'NOT_FOUND', message: 'Job not found' });
    res.json({ ok: true, job });
  } catch (err) {
    next(err);
  }
});

app.get('/api/transactions', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    console.log(`[transactions] user=${userId} limit=${limit}`);
    const [rows] = await pool.query(
      'SELECT * FROM wallet_deposits WHERE user_id=? ORDER BY block_number DESC, id DESC LIMIT ?',
      [userId, limit]
    );
    res.json({ ok: true, transactions: rows });
  } catch (err) {
    next(err);
  }
});

app.get('/staking/plans', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM staking_plans WHERE is_active=1');
    const plans = rows.map((r) => {
      const asset = (r.stake_asset || 'ELTX').toUpperCase();
      const decimalsRaw = r.stake_decimals !== undefined && r.stake_decimals !== null ? Number(r.stake_decimals) : null;
      const decimals = Number.isFinite(decimalsRaw) && decimalsRaw > 0 ? decimalsRaw : getSymbolDecimals(asset);
      const minDepositWei = r.min_deposit_wei ? bigIntFromValue(r.min_deposit_wei) : 0n;
      let minDeposit = null;
      if (minDepositWei > 0n) {
        const decimalVal = decimalFromWei(minDepositWei, decimals);
        minDeposit = formatDecimalValue(decimalVal, Math.min(decimals, 8));
      }
      return {
        id: r.id,
        name: r.name || r.title,
        duration_days: r.duration_days ?? r.duration_months ?? null,
        apr_bps: r.apr_bps ?? r.daily_rate ?? null,
        asset,
        asset_decimals: decimals,
        min_deposit: minDeposit,
        min_deposit_wei: minDepositWei > 0n ? minDepositWei.toString() : null,
      };
    });
    res.json({ ok: true, plans });
  } catch (err) {
    next(err);
  }
});

const CreatePosSchema = z.object({ planId: z.coerce.number().int(), amount: z.string() });

app.post('/staking/positions', async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const { planId, amount } = CreatePosSchema.parse(req.body);
    const normalizedAmount = amount.trim();
    if (!normalizedAmount)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[plan]] = await conn.query(
      'SELECT id, duration_days, apr_bps, stake_asset, stake_decimals, min_deposit_wei FROM staking_plans WHERE id=? AND is_active=1',
      [planId]
    );
    if (!plan) return next({ status: 400, code: 'INVALID_PLAN', message: 'Plan not found' });
    const asset = (plan.stake_asset || 'ELTX').toUpperCase();
    const decimalsRaw = plan.stake_decimals !== undefined && plan.stake_decimals !== null ? Number(plan.stake_decimals) : null;
    const stakeDecimals = Number.isFinite(decimalsRaw) && decimalsRaw > 0 ? decimalsRaw : getSymbolDecimals(asset);
    let amountWei;
    try {
      amountWei = ethers.parseUnits(normalizedAmount, stakeDecimals);
    } catch {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }
    if (amountWei <= 0n) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }

    const minDepositWei = plan.min_deposit_wei ? bigIntFromValue(plan.min_deposit_wei) : 0n;
    if (minDepositWei > 0n && amountWei < minDepositWei) {
      await conn.rollback();
      return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount below minimum' });
    }

    const [balanceRows] = await conn.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
      [userId, asset]
    );
    if (!balanceRows.length) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }
    const balanceWei = bigIntFromValue(balanceRows[0].balance_wei);
    if (balanceWei < amountWei) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }

    await conn.query(
      'UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?',
      [amountWei.toString(), userId, asset]
    );

    const amountDecimal = decimalFromWei(amountWei, stakeDecimals);
    const amountStr = formatDecimalValue(amountDecimal, Math.min(stakeDecimals, 18));
    const aprBps = Number(plan.apr_bps || 0);
    const dailyDecimal = amountDecimal.mul(aprBps).div(10000).div(365);
    const dailyStr = formatDecimalValue(dailyDecimal, Math.min(stakeDecimals, 18));

    const [result] = await conn.query(
      'INSERT INTO staking_positions (user_id,plan_id,stake_asset,stake_decimals,amount,amount_wei,apr_bps_snapshot,start_date,end_date,daily_reward) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), ?)',
      [
        userId,
        plan.id,
        asset,
        stakeDecimals,
        amountStr,
        amountWei.toString(),
        aprBps,
        plan.duration_days,
        dailyStr,
      ]
    );
    await conn.commit();
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input' });
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/staking/positions', async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      `SELECT sp.id, sp.amount, sp.amount_wei, sp.stake_asset, sp.stake_decimals, sp.start_date, sp.end_date, sp.daily_reward,
              sp.accrued_total, sp.status, pl.name
         FROM staking_positions sp
         JOIN staking_plans pl ON sp.plan_id=pl.id
        WHERE sp.user_id=?
        ORDER BY sp.created_at DESC`,
      [userId]
    );
    const positions = rows.map((row) => {
      const asset = (row.stake_asset || 'ELTX').toUpperCase();
      const decimalsRaw = row.stake_decimals !== undefined && row.stake_decimals !== null ? Number(row.stake_decimals) : null;
      const stakeDecimals = Number.isFinite(decimalsRaw) && decimalsRaw > 0 ? decimalsRaw : getSymbolDecimals(asset);
      const amountWei = row.amount_wei ? bigIntFromValue(row.amount_wei) : 0n;
      const amountDecimal = decimalFromWei(amountWei, stakeDecimals);
      const amount = formatDecimalValue(amountDecimal, Math.min(stakeDecimals, 8));
      const daily = formatDecimalValue(row.daily_reward, Math.min(stakeDecimals, 8));
      const accrued = formatDecimalValue(row.accrued_total, Math.min(stakeDecimals, 8));
      return {
        id: row.id,
        name: row.name,
        amount,
        amount_wei: amountWei.toString(),
        daily_reward: daily,
        accrued_total: accrued,
        stake_asset: asset,
        stake_decimals: stakeDecimals,
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.status,
      };
    });
    res.json({ ok: true, positions });
  } catch (err) {
    next(err);
  }
});

app.post('/staking/positions/:id/close', async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const id = Number(req.params.id);
    const [[pos]] = await pool.query(
      'SELECT id, amount, accrued_total, end_date, status FROM staking_positions WHERE id=? AND user_id=?',
      [id, userId]
    );
    if (!pos) return next({ status: 404, code: 'NOT_FOUND', message: 'Position not found' });
    if (pos.status !== 'active') return next({ status: 400, code: 'INVALID_STATE', message: 'Already closed' });
    const today = new Date().toISOString().slice(0, 10);
    if (today < pos.end_date.toISOString().slice(0, 10))
      return next({ status: 400, code: 'TOO_SOON', message: 'Cannot close before maturity' });
    await pool.query('UPDATE staking_positions SET status="matured" WHERE id=?', [id]);
    res.json({ ok: true, principal: pos.amount, reward: pos.accrued_total });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  const id = req.requestId || crypto.randomUUID();
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  const message = err.message || 'Internal error';
  const body = { ok: false, error: { code, message, id } };
  if (err.details) body.error.details = err.details;
  console.error(`[${id}]`, err);
  res.status(status).json(body);
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});

