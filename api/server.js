require('dotenv').config({ path: '/home/dash/.env' });
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
const Stripe = require('stripe');
const OpenAI = require('openai');
const { logMasterFingerprint, getMasterMnemonic } = require('../src/utils/hdWallet');
const { provisionUserAddress, getUserBalance } = require('./src/services/wallet');
const {
  syncSwapAssetPrices,
  getSwapAssetConfig,
  getSwapPricingMode,
  isSupportedSwapAsset,
} = require('./src/services/pricing');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const STRIPE_BASE_FALLBACK = 'https://eltx.online';

const DEFAULT_SPOT_MAX_SLIPPAGE_BPS = 300n;
const DEFAULT_SPOT_MAX_DEVIATION_BPS = 800n;
const DEFAULT_SPOT_CANDLE_FETCH_LIMIT = 3000;

function normalizeSettingValue(value) {
  if (value === undefined || value === null) return null;
  const str = value.toString().trim();
  return str.length ? str : null;
}

function normalizeBaseUrl(value) {
  const normalized = normalizeSettingValue(value);
  if (!normalized) return null;
  return normalized.replace(/\/+$/, '');
}

function buildDefaultSuccessUrl(base) {
  const normalized = normalizeBaseUrl(base) || STRIPE_BASE_FALLBACK;
  return `${normalized}/buy?status=success&session_id={CHECKOUT_SESSION_ID}`;
}

function buildDefaultCancelUrl(base) {
  const normalized = normalizeBaseUrl(base) || STRIPE_BASE_FALLBACK;
  return `${normalized}/buy?status=cancelled`;
}

function parsePositiveNumberSetting(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function parseOptionalPositiveNumber(value) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return null;
}

const DEFAULT_STRIPE_RETURN_BASE =
  normalizeBaseUrl(process.env.APP_BASE_URL || process.env.STRIPE_RETURN_URL_BASE || STRIPE_BASE_FALLBACK) ||
  STRIPE_BASE_FALLBACK;

let stripeSecretKey = normalizeSettingValue(process.env.STRIPE_SECRET_KEY);
let stripePublishableKey = normalizeSettingValue(
  process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);
let stripeWebhookSecret = normalizeSettingValue(process.env.STRIPE_WEBHOOK_SECRET);
let stripeReturnBase = DEFAULT_STRIPE_RETURN_BASE;
let stripeSuccessUrl = normalizeSettingValue(process.env.STRIPE_SUCCESS_URL) || buildDefaultSuccessUrl(stripeReturnBase);
let stripeCancelUrl = normalizeSettingValue(process.env.STRIPE_CANCEL_URL) || buildDefaultCancelUrl(stripeReturnBase);
let stripeMinPurchaseUsd = parsePositiveNumberSetting(process.env.STRIPE_MIN_PURCHASE_USD, 10);
let stripeMaxPurchaseUsd = parseOptionalPositiveNumber(process.env.STRIPE_MAX_PURCHASE_USD);

let stripe = null;
let stripeInitError = null;

function initializeStripeSdk() {
  stripe = null;
  stripeInitError = null;
  if (!stripeSecretKey) return;
  try {
    stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
  } catch (err) {
    stripeInitError = err?.message || 'Unknown error';
    console.error('[stripe] init failed', err.message || err);
    stripe = null;
  }
}

initializeStripeSdk();

const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function isStripeEnabled() {
  return !!stripe && !!stripePublishableKey;
}

function applyStripeConfig(partial) {
  let reinitialize = false;
  if (Object.prototype.hasOwnProperty.call(partial, 'secretKey')) {
    const normalized = normalizeSettingValue(partial.secretKey);
    if (normalized !== stripeSecretKey) {
      stripeSecretKey = normalized;
      reinitialize = true;
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'publishableKey')) {
    stripePublishableKey = normalizeSettingValue(partial.publishableKey);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'webhookSecret')) {
    stripeWebhookSecret = normalizeSettingValue(partial.webhookSecret);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'returnBase')) {
    const normalizedBase = normalizeBaseUrl(partial.returnBase) || DEFAULT_STRIPE_RETURN_BASE;
    stripeReturnBase = normalizedBase;
    if (!Object.prototype.hasOwnProperty.call(partial, 'successUrl')) {
      stripeSuccessUrl = buildDefaultSuccessUrl(stripeReturnBase);
    }
    if (!Object.prototype.hasOwnProperty.call(partial, 'cancelUrl')) {
      stripeCancelUrl = buildDefaultCancelUrl(stripeReturnBase);
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'successUrl')) {
    const normalizedSuccess = normalizeSettingValue(partial.successUrl);
    stripeSuccessUrl = normalizedSuccess || buildDefaultSuccessUrl(stripeReturnBase);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'cancelUrl')) {
    const normalizedCancel = normalizeSettingValue(partial.cancelUrl);
    stripeCancelUrl = normalizedCancel || buildDefaultCancelUrl(stripeReturnBase);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'minPurchaseUsd')) {
    stripeMinPurchaseUsd = parsePositiveNumberSetting(partial.minPurchaseUsd, stripeMinPurchaseUsd || 10);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'maxPurchaseUsd')) {
    stripeMaxPurchaseUsd = parseOptionalPositiveNumber(partial.maxPurchaseUsd);
  }
  if (reinitialize) {
    initializeStripeSdk();
  }
}

function getStripeIssues() {
  const issues = [];
  if (!stripeSecretKey) issues.push('STRIPE_SECRET_KEY is not set');
  if (!stripePublishableKey) issues.push('STRIPE_PUBLISHABLE_KEY is not set');
  if (!stripeWebhookSecret) issues.push('STRIPE_WEBHOOK_SECRET is not set');
  if (stripeSecretKey && !stripe) {
    issues.push(
      stripeInitError ? `Stripe SDK failed to initialize (${stripeInitError})` : 'Stripe SDK is not initialized'
    );
  }
  return issues;
}

function getStripeStatusPayload(audience = 'public') {
  const issues = getStripeIssues();
  const reason = issues.length ? issues.join('; ') : null;
  const base = {
    enabled: isStripeEnabled(),
    reason,
    publishableKey: stripePublishableKey,
  };
  if (audience === 'admin') {
    return {
      ...base,
      secretKey: stripeSecretKey,
      webhookSecret: stripeWebhookSecret,
      returnUrlBase: stripeReturnBase,
      successUrl: stripeSuccessUrl,
      cancelUrl: stripeCancelUrl,
      minPurchaseUsd: stripeMinPurchaseUsd,
      maxPurchaseUsd: stripeMaxPurchaseUsd,
      sdkReady: !!stripe,
    };
  }
  return base;
}

const MASTER_MNEMONIC = getMasterMnemonic();
process.env.MASTER_MNEMONIC = MASTER_MNEMONIC;
['MASTER_MNEMONIC', 'DATABASE_URL'].forEach((v) => {
  if (!process.env[v]) throw new Error(`${v} is not set`);
});
logMasterFingerprint('api-server');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['https://eltx.online'];
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});
app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
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

const STRIPE_SETTING_KEYS = [
  'stripe_publishable_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'stripe_return_url_base',
  'stripe_success_url',
  'stripe_cancel_url',
  'stripe_min_purchase_usd',
  'stripe_max_purchase_usd',
];

async function refreshStripeConfigFromDb() {
  try {
    const placeholders = STRIPE_SETTING_KEYS.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT name, value FROM platform_settings WHERE name IN (${placeholders})`,
      STRIPE_SETTING_KEYS
    );
    if (!rows.length) return;
    const updates = {};
    for (const row of rows) {
      const rawValue = row.value === undefined || row.value === null ? null : row.value.toString();
      switch (row.name) {
        case 'stripe_publishable_key':
          updates.publishableKey = rawValue;
          break;
        case 'stripe_secret_key':
          updates.secretKey = rawValue;
          break;
        case 'stripe_webhook_secret':
          updates.webhookSecret = rawValue;
          break;
        case 'stripe_return_url_base':
          updates.returnBase = rawValue;
          break;
        case 'stripe_success_url':
          updates.successUrl = rawValue;
          break;
        case 'stripe_cancel_url':
          updates.cancelUrl = rawValue;
          break;
        case 'stripe_min_purchase_usd':
          updates.minPurchaseUsd = rawValue;
          break;
        case 'stripe_max_purchase_usd':
          updates.maxPurchaseUsd = rawValue;
          break;
        default:
          break;
      }
    }
    if (Object.keys(updates).length) {
      applyStripeConfig(updates);
    }
  } catch (err) {
    console.error('[stripe] Failed to load Stripe configuration from database', err.message || err);
  }
}

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

ensureWalletSchema()
  .then(() => refreshStripeConfigFromDb())
  .catch(() => {});

const STRIPE_CONFIG_REFRESH_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.STRIPE_CONFIG_REFRESH_INTERVAL_MS || 5 * 60 * 1000)
);
const stripeRefreshTimer = setInterval(() => {
  refreshStripeConfigFromDb();
}, STRIPE_CONFIG_REFRESH_INTERVAL_MS);
if (typeof stripeRefreshTimer.unref === 'function') {
  stripeRefreshTimer.unref();
}

// start background scanner runner
const startRunner = require('./background/runner');
startRunner(pool);

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const walletLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const ADMIN_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'asid';
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN || (IS_PROD ? '.eltx.online' : undefined);
const sessionCookie = {
  httpOnly: true,
  sameSite: IS_PROD ? 'none' : 'lax',
  secure: IS_PROD,
  domain: COOKIE_DOMAIN,
  path: '/',
  maxAge: 1000 * 60 * 60,
};

const ADMIN_SESSION_TTL_SECONDS = Math.max(60, Number(process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 2));
const adminSessionCookie = {
  httpOnly: true,
  sameSite: IS_PROD ? 'strict' : 'lax',
  secure: IS_PROD,
  domain: COOKIE_DOMAIN,
  path: '/',
  maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
};

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  username: z.string().trim().min(3),
  language: z.string().trim().optional(),
});

const LoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    username: z.string().trim().min(3).optional(),
    password: z.string().min(8),
  })
  .refine((d) => d.email || d.username, {
    message: 'Email or username required',
  });

const AdminLoginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
});

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const AdminUserCreateSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(64),
  password: z.string().min(12),
  role: z.enum(['superadmin', 'manager']).default('manager'),
  is_active: z.boolean().optional(),
});

const AdminUserUpdateSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().min(3).max(64).optional(),
    password: z.string().min(12).optional(),
    role: z.enum(['superadmin', 'manager']).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
  });

const AdminUsersQuerySchema = PaginationSchema.extend({
  q: z.string().max(191).optional(),
});

const UserUpdateSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().min(3).optional(),
    language: z.string().max(5).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
  });

const AdminPasswordResetSchema = z.object({
  password: z.string().min(8),
});

const AdminBalanceAdjustSchema = z.object({
  asset: z.string().min(2).max(32),
  amount: z.string().min(1),
  direction: z.enum(['credit', 'debit']),
  reason: z.string().max(255).optional(),
});

const AdminTransactionsQuerySchema = PaginationSchema.extend({
  type: z.enum(['deposits', 'transfers', 'swaps', 'spot', 'fiat']).default('deposits'),
});

const SpotRiskSettingsSchema = z
  .object({
    max_slippage_bps: z.coerce.number().int().min(0).max(10000).optional(),
    max_deviation_bps: z.coerce.number().int().min(0).max(10000).optional(),
    candle_fetch_cap: z.coerce.number().int().min(100).max(10000).optional(),
  })
  .refine(
    (data) =>
      data.max_slippage_bps !== undefined ||
      data.max_deviation_bps !== undefined ||
      data.candle_fetch_cap !== undefined,
    {
      message: 'At least one spot protection field must be provided',
    }
  );

const AdminFeeUpdateSchema = z
  .object({
    swap_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    spot_trade_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    spot_maker_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    spot_taker_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    transfer_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (data) =>
      data.swap_fee_bps !== undefined ||
      data.spot_trade_fee_bps !== undefined ||
      data.spot_maker_fee_bps !== undefined ||
      data.spot_taker_fee_bps !== undefined ||
      data.transfer_fee_bps !== undefined,
    {
      message: 'At least one fee field must be provided',
    }
  );

const AdminStakingPlanCreateSchema = z.object({
  name: z.string().min(2).max(32),
  duration_days: z.coerce.number().int().min(1).max(3650),
  apr_bps: z.coerce.number().int().min(0).max(100000),
  stake_asset: z.string().min(2).max(32).default('ELTX'),
  stake_decimals: z.coerce.number().int().min(0).max(36).default(18),
  min_deposit: z.string().optional(),
  is_active: z.boolean().optional(),
});

const AdminStakingPlanUpdateSchema = AdminStakingPlanCreateSchema.partial();

const AdminStakingPositionUpdateSchema = z.object({
  status: z.enum(['active', 'matured', 'cancelled']),
});

const AdminStakingPositionsQuerySchema = PaginationSchema.extend({
  status: z.enum(['active', 'matured', 'cancelled', 'all']).default('active'),
});

const AdminSwapPriceUpdateSchema = z
  .object({
    price_eltx: z.string().optional(),
    min_amount: z.string().optional(),
    max_amount: z.string().nullable().optional(),
    spread_bps: z.coerce.number().int().min(0).max(10000).optional(),
    asset_reserve_wei: z.string().optional(),
    eltx_reserve_wei: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
  });

const AdminSpotMarketUpdateSchema = z
  .object({
    min_base_amount: z.string().optional(),
    min_quote_amount: z.string().optional(),
    price_precision: z.coerce.number().int().min(0).max(18).optional(),
    amount_precision: z.coerce.number().int().min(0).max(18).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
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

function toDateOnlyString(value) {
  if (!value) return null;
  try {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function addDays(dateStr, days) {
  try {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

const ELTX_SYMBOL = 'ELTX';
const AI_DAILY_FREE_SETTING = 'ai_daily_free_messages';
const AI_PRICE_SETTING = 'ai_message_price_eltx';
const DEFAULT_AI_DAILY_FREE = 10;
const DEFAULT_AI_PRICE = '1';

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
const STAKING_SWEEP_INTERVAL_MS = Number(process.env.STAKING_SWEEP_INTERVAL_MS || 15 * 60 * 1000);

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

function decimalToWeiString(amount, decimals) {
  try {
    const decimalValue = new Decimal(amount);
    if (!decimalValue.isFinite() || decimalValue.isNegative()) return null;
    const scaled = decimalValue.mul(Decimal.pow(10, decimals));
    const fixed = scaled.toFixed(0, Decimal.ROUND_DOWN);
    return fixed;
  } catch {
    return null;
  }
}

function normalizePositiveDecimal(value, precision = 18) {
  try {
    const decimalValue = new Decimal(value);
    if (!decimalValue.isFinite() || decimalValue.isNegative()) return null;
    return decimalValue.toFixed(precision, Decimal.ROUND_DOWN);
  } catch {
    return null;
  }
}

function presentAdminRow(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

async function getPlatformSettingValue(name, defaultValue = '0', conn = pool) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query('SELECT value FROM platform_settings WHERE name=?', [name]);
  if (!rows.length || rows[0].value === undefined || rows[0].value === null) return defaultValue;
  return rows[0].value.toString();
}

async function setPlatformSettingValue(name, value, conn = pool) {
  const executor = conn.query ? conn : pool;
  await executor.query(
    'INSERT INTO platform_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [name, value]
  );
}

async function readAiSettings(conn = pool) {
  const dailyVal = await getPlatformSettingValue(AI_DAILY_FREE_SETTING, DEFAULT_AI_DAILY_FREE.toString(), conn);
  const priceVal = await getPlatformSettingValue(AI_PRICE_SETTING, DEFAULT_AI_PRICE, conn);
  const dailyParsed = Number.parseInt(dailyVal, 10);
  const dailyFree = Number.isFinite(dailyParsed) && dailyParsed >= 0 ? dailyParsed : DEFAULT_AI_DAILY_FREE;
  const normalizedPrice = normalizePositiveDecimal(priceVal, 18) || '0';
  return { daily_free_messages: dailyFree, message_price_eltx: normalizedPrice };
}

async function getAiUsageRow(conn, userId, usageDate, { forUpdate = false } = {}) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query(
    `SELECT user_id, usage_date, messages_used, paid_messages, eltx_spent_wei, last_message_at
       FROM ai_daily_usage WHERE user_id=? AND usage_date=?${forUpdate ? ' FOR UPDATE' : ''}`,
    [userId, usageDate]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    user_id: Number(row.user_id),
    usage_date: toDateOnlyString(row.usage_date),
    messages_used: Number(row.messages_used || 0),
    paid_messages: Number(row.paid_messages || 0),
    eltx_spent_wei: bigIntFromValue(row.eltx_spent_wei || 0),
    last_message_at: row.last_message_at || null,
  };
}

function presentAiUsageRow(usage, settings, decimals) {
  const used = usage?.messages_used || 0;
  const paid = usage?.paid_messages || 0;
  const spentWei = usage?.eltx_spent_wei || 0n;
  return {
    daily_free_messages: settings.daily_free_messages,
    messages_used: used,
    paid_messages: paid,
    free_remaining: Math.max(settings.daily_free_messages - used, 0),
    eltx_spent_wei: spentWei.toString(),
    eltx_spent: trimDecimal(formatUnitsStr(spentWei.toString(), decimals)),
    last_message_at: usage?.last_message_at || null,
  };
}

function getTodayDateString() {
  return toDateOnlyString(new Date()) || new Date().toISOString().slice(0, 10);
}

async function readAiUsageSummary(date, conn = pool) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query(
    `SELECT COALESCE(SUM(messages_used),0) AS messages_used,
            COALESCE(SUM(paid_messages),0) AS paid_messages,
            COALESCE(SUM(eltx_spent_wei),0) AS eltx_spent_wei
       FROM ai_daily_usage WHERE usage_date=?`,
    [date]
  );
  const row = rows[0] || {};
  const decimals = getSymbolDecimals(ELTX_SYMBOL);
  const spentWei = bigIntFromValue(row.eltx_spent_wei || 0);
  const total = Number(row.messages_used || 0);
  const paid = Number(row.paid_messages || 0);
  return {
    messages_used: total,
    paid_messages: paid,
    free_messages: Math.max(total - paid, 0),
    eltx_spent_wei: spentWei.toString(),
    eltx_spent: trimDecimal(formatUnitsStr(spentWei.toString(), decimals)),
  };
}

async function readPlatformFeeSettings(conn = pool) {
  const swapVal = await getPlatformSettingValue('swap_fee_bps', '50', conn);
  const spotVal = await getPlatformSettingValue('spot_trade_fee_bps', '50', conn);
  const makerVal = await getPlatformSettingValue('spot_maker_fee_bps', spotVal, conn);
  const takerVal = await getPlatformSettingValue('spot_taker_fee_bps', spotVal, conn);
  const transferVal = await getPlatformSettingValue('transfer_fee_bps', '0', conn);
  const swapFeeBps = clampBps(BigInt(Number.parseInt(swapVal, 10) || 0));
  const spotMakerFeeBps = clampBps(BigInt(Number.parseInt(makerVal, 10) || 0));
  const spotTakerFeeBps = clampBps(BigInt(Number.parseInt(takerVal, 10) || 0));
  const transferFeeBps = clampBps(BigInt(Number.parseInt(transferVal, 10) || 0));
  return {
    swap_fee_bps: Number(swapFeeBps),
    spot_trade_fee_bps: Number(spotTakerFeeBps),
    spot_maker_fee_bps: Number(spotMakerFeeBps),
    spot_taker_fee_bps: Number(spotTakerFeeBps),
    transfer_fee_bps: Number(transferFeeBps),
  };
}

async function readPlatformFeeBalances(conn = pool) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query(
    `SELECT fee_type, asset, COUNT(*) AS entries, COALESCE(SUM(amount_wei), 0) AS total_wei
     FROM platform_fees
     GROUP BY fee_type, asset
     ORDER BY fee_type, asset`
  );
  return rows.map((row) => {
    const asset = (row.asset || ELTX_SYMBOL).toUpperCase();
    const decimals = getSymbolDecimals(asset);
    const totalWei = bigIntFromValue(row.total_wei || 0);
    return {
      fee_type: row.fee_type,
      asset,
      entries: Number(row.entries || 0),
      amount_wei: totalWei.toString(),
      amount: trimDecimal(formatUnitsStr(totalWei.toString(), decimals)),
    };
  });
}

async function readSpotFeeBps(conn = pool) {
  const defaultVal = await getPlatformSettingValue('spot_trade_fee_bps', '50', conn);
  const makerVal = await getPlatformSettingValue('spot_maker_fee_bps', defaultVal, conn);
  const takerVal = await getPlatformSettingValue('spot_taker_fee_bps', defaultVal, conn);
  const makerFeeBps = clampBps(BigInt(Number.parseInt(makerVal, 10) || 0));
  const takerFeeBps = clampBps(BigInt(Number.parseInt(takerVal, 10) || 0));
  return { maker: Number(makerFeeBps), taker: Number(takerFeeBps) };
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

async function getSpotMarketForSwap(asset, conn = pool) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query(
    `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount, price_precision,
            amount_precision, active
       FROM spot_markets
      WHERE UPPER(base_asset)=? AND UPPER(quote_asset)=? AND active=1
      LIMIT 1`,
    [ELTX_SYMBOL, asset]
  );
  return rows.length ? rows[0] : null;
}

async function getSpotTopOfBook(conn, marketId, { forUpdate = false } = {}) {
  const [[ask]] = await conn.query(
    `SELECT price_wei
       FROM spot_orders
      WHERE market_id=? AND side='sell' AND status='open'
      ORDER BY price_wei ASC, id ASC
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [marketId]
  );
  const [[bid]] = await conn.query(
    `SELECT price_wei
       FROM spot_orders
      WHERE market_id=? AND side='buy' AND status='open'
      ORDER BY price_wei DESC, id ASC
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [marketId]
  );
  return { ask: ask ? BigInt(ask.price_wei) : null, bid: bid ? BigInt(bid.price_wei) : null };
}

async function getSpotLastTradePriceWei(conn, marketId) {
  const executor = conn.query ? conn : pool;
  const [[row]] = await executor.query(
    'SELECT price_wei FROM spot_trades WHERE market_id=? ORDER BY id DESC LIMIT 1',
    [marketId]
  );
  return row ? BigInt(row.price_wei) : null;
}

function computeRelativeBps(value, reference) {
  if (!value || !reference || reference === 0n) return 0n;
  const diff = value > reference ? value - reference : reference - value;
  return mulDiv(diff, 10000n, reference);
}

async function readSpotRiskSettings(conn = pool) {
  const maxSlippage = await getPlatformSettingValue(
    'spot_max_slippage_bps',
    DEFAULT_SPOT_MAX_SLIPPAGE_BPS.toString(),
    conn
  );
  const maxDeviation = await getPlatformSettingValue(
    'spot_max_deviation_bps',
    DEFAULT_SPOT_MAX_DEVIATION_BPS.toString(),
    conn
  );
  const candleFetchCap = await getPlatformSettingValue(
    'spot_candle_fetch_cap',
    DEFAULT_SPOT_CANDLE_FETCH_LIMIT.toString(),
    conn
  );
  return {
    maxSlippageBps: clampBps(BigInt(Number.parseInt(maxSlippage, 10) || Number(DEFAULT_SPOT_MAX_SLIPPAGE_BPS))),
    maxDeviationBps: clampBps(BigInt(Number.parseInt(maxDeviation, 10) || Number(DEFAULT_SPOT_MAX_DEVIATION_BPS))),
    candleFetchCap: Number.parseInt(candleFetchCap, 10) || DEFAULT_SPOT_CANDLE_FETCH_LIMIT,
  };
}

async function readSpotOrderbookSnapshot(conn, marketRow) {
  const [bidRows] = await conn.query(
    `SELECT price_wei, SUM(remaining_base_wei) AS base_total
       FROM spot_orders
       WHERE market_id=? AND status='open' AND side='buy'
       GROUP BY price_wei
       ORDER BY price_wei DESC
       LIMIT 50`,
    [marketRow.id]
  );
  const [askRows] = await conn.query(
    `SELECT price_wei, SUM(remaining_base_wei) AS base_total
       FROM spot_orders
       WHERE market_id=? AND status='open' AND side='sell'
       GROUP BY price_wei
       ORDER BY price_wei ASC
       LIMIT 50`,
    [marketRow.id]
  );
  const [tradeRows] = await conn.query(
    `SELECT id, price_wei, base_amount_wei, quote_amount_wei, taker_side, created_at
       FROM spot_trades
       WHERE market_id=?
       ORDER BY id DESC
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

  return {
    orderbook: { bids: bidRows.map(formatLevel), asks: askRows.map(formatLevel) },
    trades,
  };
}

async function readSpotOrdersForUser(conn, userId, marketRow) {
  const [orderRows] = await conn.query(
    `SELECT so.*, sm.symbol, sm.base_asset, sm.quote_asset, sm.base_decimals, sm.quote_decimals
       FROM spot_orders so
       JOIN spot_markets sm ON sm.id = so.market_id
       WHERE so.user_id = ? AND so.market_id = ?
       ORDER BY FIELD(so.status,'open','filled','cancelled'), so.id DESC
       LIMIT 100`,
    [userId, marketRow.id]
  );
  return orderRows.map((row) => {
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
}

async function readUserBalancesForAssets(conn, userId, assets) {
  if (!assets.length) return {};
  const upper = assets.map((a) => a.toUpperCase());
  const [rows] = await conn.query(
    `SELECT asset, balance_wei
       FROM user_balances
      WHERE user_id=? AND UPPER(asset) IN (${upper.map(() => '?').join(',')})`,
    [userId, ...upper]
  );
  const result = {};
  for (const row of rows) {
    const asset = row.asset.toUpperCase();
    const decimals = getSymbolDecimals(asset);
    const balanceWei = bigIntFromValue(row.balance_wei);
    result[asset] = {
      symbol: asset,
      balance: trimDecimal(formatUnitsStr(balanceWei.toString(), decimals)),
      balance_wei: balanceWei.toString(),
      decimals,
    };
  }
  return result;
}

async function simulateSpotMarketBuy(conn, market, quoteAmountWei, takerFeeBps) {
  const result = { filledBase: 0n, spentQuote: 0n, takerFee: 0n, averagePriceWei: 0n };
  const [asks] = await conn.query(
    `SELECT price_wei, remaining_base_wei, fee_bps
       FROM spot_orders
      WHERE market_id=? AND side='sell' AND status='open'
      ORDER BY price_wei ASC, id ASC
      LIMIT 200`,
    [market.id]
  );
  let remainingQuote = quoteAmountWei;
  for (const row of asks) {
    if (remainingQuote <= 0n) break;
    const makerBase = bigIntFromValue(row.remaining_base_wei);
    const priceWei = BigInt(row.price_wei || 0);
    if (makerBase <= 0n || priceWei <= 0n) continue;

    const feeMultiplier = 10000n + takerFeeBps;
    const costPerBase = mulDiv(priceWei, feeMultiplier, 10000n);
    let tradeBase = makerBase;
    let takerCost = mulDiv(tradeBase, costPerBase, PRICE_SCALE);
    if (takerCost > remainingQuote) {
      tradeBase = mulDiv(remainingQuote, PRICE_SCALE, costPerBase);
      takerCost = mulDiv(tradeBase, costPerBase, PRICE_SCALE);
    }
    if (tradeBase <= 0n || takerCost <= 0n) continue;

    const quoteWithoutFee = computeQuoteAmount(tradeBase, priceWei);
    if (quoteWithoutFee <= 0n) continue;
    const takerFee = (quoteWithoutFee * takerFeeBps) / 10000n;

    remainingQuote -= takerCost;
    result.filledBase += tradeBase;
    result.spentQuote += takerCost;
    result.takerFee += takerFee;
  }

  if (result.filledBase > 0n) {
    const grossQuote = result.spentQuote - result.takerFee;
    if (grossQuote > 0n) result.averagePriceWei = mulDiv(grossQuote, PRICE_SCALE, result.filledBase);
  }

  return result;
}

async function matchSpotOrder(conn, market, taker, { feeType = 'spot' } = {}) {
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
        feeType,
        `trade:${tradeId}:taker`,
        market.quote_asset,
        takerFee.toString(),
      ]);
    }
    if (makerFee > 0n) {
      await conn.query('INSERT INTO platform_fees (fee_type, reference, asset, amount_wei) VALUES (?,?,?,?)', [
        feeType,
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

const StripeSessionSchema = z.object({
  amount_usd: z.union([z.string(), z.number()]),
  expected_price_eltx: z.string().optional(),
});

const AiChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      })
    )
    .min(1),
});

const AiSettingsSchema = z.object({
  daily_free_messages: z.number().int().min(0),
  message_price_eltx: z.union([z.string(), z.number()]),
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

async function requireAdmin(req, { extend = true } = {}) {
  const token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token) throw { status: 401, code: 'UNAUTHENTICATED', message: 'Admin authentication required' };
  const [rows] = await pool.query(
    `SELECT au.id, au.email, au.username, au.role, au.is_active
       FROM admin_sessions s
       JOIN admin_users au ON au.id = s.admin_id
      WHERE s.id = ? AND s.expires_at > NOW()`,
    [token]
  );
  if (!rows.length) throw { status: 401, code: 'UNAUTHENTICATED', message: 'Admin authentication required' };
  const admin = rows[0];
  if (!admin.is_active) throw { status: 403, code: 'ADMIN_DISABLED', message: 'Admin account disabled' };
  if (extend) {
    await pool.query('UPDATE admin_sessions SET expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id=?', [
      ADMIN_SESSION_TTL_SECONDS,
      token,
    ]);
  }
  return admin;
}

app.post('/stripe/webhook', async (req, res) => {
  if (!stripe || !stripeWebhookSecret) {
    return res.status(503).send('Stripe unavailable');
  }
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).send('Missing signature');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (err) {
    console.warn('[stripe] invalid webhook signature', err.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleStripeCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await markStripeSessionStatus(event.data.object, 'expired');
        break;
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await handleStripePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
      case 'charge.refund.updated':
        await handleStripeRefund(event.data.object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] webhook handler failed', err);
    res.status(500).send('Webhook handler error');
  }
});

app.get('/fiat/stripe/rate', walletLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    if (stripe) {
      try {
        await syncSwapAssetPrices(pool);
      } catch (err) {
        console.warn('[stripe] price sync skipped', err.message || err);
      }
    }
    const pricing = await getStripePricing(pool);
    const min = pricing.min.toFixed(2, Decimal.ROUND_UP);
    const max = pricing.max ? pricing.max.toFixed(2, Decimal.ROUND_DOWN) : null;
    res.json({
      ok: true,
      pricing: {
        asset: pricing.asset,
        price_eltx: pricing.price.toFixed(18, Decimal.ROUND_DOWN),
        min_usd: min,
        max_usd: max,
        updated_at: pricing.updatedAt,
      },
      stripe: getStripeStatusPayload('public'),
    });
  } catch (err) {
    next(err);
  }
});

app.post('/fiat/stripe/session', walletLimiter, async (req, res, next) => {
  if (!isStripeEnabled()) {
    const status = getStripeStatusPayload('public');
    return next({
      status: 503,
      code: 'STRIPE_DISABLED',
      message: status.reason || 'Card payments are not available right now.',
    });
  }
  let conn;
  try {
    const userId = await requireUser(req);
    const payload = StripeSessionSchema.parse(req.body || {});
    const amountInput =
      typeof payload.amount_usd === 'number' ? payload.amount_usd.toString() : String(payload.amount_usd || '').trim();
    let amountDecimal;
    try {
      amountDecimal = new Decimal(amountInput || '0');
    } catch {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }
    if (!amountDecimal.isFinite() || amountDecimal.lte(0)) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const pricing = await getStripePricing(conn);
    const min = pricing.min;
    const max = pricing.max;
    if (amountDecimal.lt(min)) {
      await conn.rollback();
      return next({
        status: 400,
        code: 'AMOUNT_TOO_SMALL',
        message: 'Amount below minimum',
        details: { min: min.toFixed(2, Decimal.ROUND_UP) },
      });
    }
    if (max && amountDecimal.gt(max)) {
      await conn.rollback();
      return next({
        status: 400,
        code: 'AMOUNT_TOO_LARGE',
        message: 'Amount above maximum',
        details: { max: max.toFixed(2, Decimal.ROUND_DOWN) },
      });
    }

    const normalizedUsd = amountDecimal.toFixed(2, Decimal.ROUND_HALF_UP);
    const amountMinor = Number(amountDecimal.mul(100).toFixed(0, Decimal.ROUND_HALF_UP));
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }

    const price = pricing.price;
    const eltxDecimal = amountDecimal.mul(price);
    const eltxAmount = eltxDecimal.toFixed(18, Decimal.ROUND_DOWN);
    const eltxWei = ethers.parseUnits(eltxAmount, 18).toString();

    const [[userRow]] = await conn.query('SELECT email FROM users WHERE id=? LIMIT 1', [userId]);

    const [insert] = await conn.query(
      `INSERT INTO fiat_purchases (user_id, status, currency, usd_amount, usd_amount_minor, price_eltx, eltx_amount, eltx_amount_wei)
       VALUES (?, 'pending', 'USD', ?, ?, ?, ?, ?)`,
      [userId, normalizedUsd, amountMinor, price.toFixed(18, Decimal.ROUND_DOWN), eltxAmount, eltxWei]
    );
    const purchaseId = insert.insertId;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: String(purchaseId),
      customer_email: userRow?.email || undefined,
      success_url: stripeSuccessUrl,
      cancel_url: stripeCancelUrl,
      metadata: { purchaseId: String(purchaseId), userId: String(userId) },
      payment_intent_data: {
        metadata: { purchaseId: String(purchaseId), userId: String(userId) },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: { name: 'ELTX Purchase' },
            unit_amount: amountMinor,
          },
        },
      ],
    });

    await conn.query('UPDATE fiat_purchases SET stripe_session_id=?, updated_at=NOW() WHERE id=?', [session.id, purchaseId]);
    await conn.commit();

    res.json({
      ok: true,
      sessionId: session.id,
      publishableKey: stripePublishableKey,
      limits: {
        min_usd: min.toFixed(2, Decimal.ROUND_UP),
        max_usd: max ? max.toFixed(2, Decimal.ROUND_DOWN) : null,
      },
      quote: {
        price_eltx: price.toFixed(18, Decimal.ROUND_DOWN),
        eltx_amount: eltxAmount,
        eltx_amount_wei: eltxWei,
        usd_amount: normalizedUsd,
      },
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/fiat/stripe/purchases', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      `SELECT id, user_id, status, currency, usd_amount, usd_amount_minor, price_eltx, eltx_amount, eltx_amount_wei,
              credited, stripe_payment_intent_id, stripe_session_id, amount_charged_minor,
              created_at, completed_at, credited_at
         FROM fiat_purchases
         WHERE user_id=?
         ORDER BY created_at DESC
         LIMIT 50`,
      [userId]
    );
    res.json({ ok: true, purchases: rows.map(formatFiatPurchaseRow) });
  } catch (err) {
    next(err);
  }
});

app.get('/fiat/stripe/session/:sessionId', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const sessionId = req.params.sessionId;
    if (!sessionId) return next({ status: 400, code: 'BAD_INPUT', message: 'Session id required' });
    const [[row]] = await pool.query(
      `SELECT id, user_id, status, currency, usd_amount, usd_amount_minor, price_eltx, eltx_amount, eltx_amount_wei,
              credited, stripe_payment_intent_id, stripe_session_id, amount_charged_minor,
              created_at, completed_at, credited_at
         FROM fiat_purchases
         WHERE stripe_session_id=? AND user_id=?
         LIMIT 1`,
      [sessionId, userId]
    );
    if (!row) return next({ status: 404, code: 'NOT_FOUND', message: 'Session not found' });
    res.json({ ok: true, purchase: formatFiatPurchaseRow(row) });
  } catch (err) {
    next(err);
  }
});

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
      const issues = err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
      const missing = err.errors
        .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
        .map((e) => e.path[0]);
      const message = issues.find((i) => i.message)?.message || 'Invalid input';
      return next({ status: 400, code: 'BAD_INPUT', message, details: { missing, issues } });
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

app.post('/admin/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { identifier, password } = AdminLoginSchema.parse(req.body || {});
    const [rows] = await pool.query(
      'SELECT id, email, username, password_hash, role, is_active, last_login_at, created_at, updated_at FROM admin_users WHERE email=? OR username=? LIMIT 1',
      [identifier, identifier]
    );
    if (!rows.length) return next({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    const adminRow = rows[0];
    if (!adminRow.is_active) return next({ status: 403, code: 'ADMIN_DISABLED', message: 'Admin account disabled' });
    const valid = await argon2.verify(adminRow.password_hash, password);
    if (!valid) return next({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
    await pool.query('INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)', [
      sessionId,
      adminRow.id,
      expiresAt,
    ]);
    await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id=?', [adminRow.id]);
    res.cookie(ADMIN_COOKIE_NAME, sessionId, adminSessionCookie);
    res.json({ ok: true, admin: presentAdminRow(adminRow) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.post('/admin/auth/logout', async (req, res) => {
  const token = req.cookies[ADMIN_COOKIE_NAME];
  if (token) {
    await pool.query('DELETE FROM admin_sessions WHERE id=?', [token]);
  }
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/admin/auth/me', async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    res.json({ ok: true, admin: presentAdminRow(admin) });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/dashboard/summary', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const [
      [[userRow]],
      [[adminRow]],
      [[balanceRow]],
      [[stakingRow]],
      [[swapRow]],
      [[spotRow]],
      [[fiatRow]],
      [[depositRow]],
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total_users FROM users'),
      pool.query('SELECT COUNT(*) AS total_admins FROM admin_users WHERE is_active = 1'),
      pool.query("SELECT COALESCE(SUM(balance_wei),0) AS eltx_balance_wei FROM user_balances WHERE UPPER(asset)='ELTX'"),
      pool.query("SELECT COUNT(*) AS active_staking FROM staking_positions WHERE status='active'"),
      pool.query(
        'SELECT COUNT(*) AS swap_count, COALESCE(SUM(eltx_amount_wei),0) AS eltx_volume_wei FROM trade_swaps'
      ),
      pool.query('SELECT COUNT(*) AS spot_trades FROM spot_trades'),
      pool.query(
        "SELECT COUNT(*) AS fiat_completed, COALESCE(SUM(usd_amount),0) AS fiat_volume_usd FROM fiat_purchases WHERE status='succeeded'"
      ),
      pool.query(
        "SELECT COUNT(*) AS confirmed_deposits FROM wallet_deposits WHERE status IN ('confirmed','swept')"
      ),
    ]);

    const eltxBalanceWei = bigIntFromValue(balanceRow?.eltx_balance_wei || 0);
    const eltxBalance = trimDecimal(formatUnitsStr(eltxBalanceWei.toString(), getSymbolDecimals(ELTX_SYMBOL)));
    const swapVolumeWei = bigIntFromValue(swapRow?.eltx_volume_wei || 0);
    const swapVolume = trimDecimal(formatUnitsStr(swapVolumeWei.toString(), getSymbolDecimals(ELTX_SYMBOL)));

    res.json({
      ok: true,
      summary: {
        total_users: Number(userRow?.total_users || 0),
        total_admins: Number(adminRow?.total_admins || 0),
        eltx_circulating_balance: {
          wei: eltxBalanceWei.toString(),
          display: eltxBalance,
        },
        staking_active: Number(stakingRow?.active_staking || 0),
        swap_volume: {
          count: Number(swapRow?.swap_count || 0),
          eltx_wei: swapVolumeWei.toString(),
          eltx: swapVolume,
        },
        spot_trades: Number(spotRow?.spot_trades || 0),
        fiat_completed: {
          count: Number(fiatRow?.fiat_completed || 0),
          usd: formatDecimalValue(fiatRow?.fiat_volume_usd || 0, 2),
        },
        confirmed_deposits: Number(depositRow?.confirmed_deposits || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/fees', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const [settings, balances] = await Promise.all([readPlatformFeeSettings(), readPlatformFeeBalances()]);
    res.json({ ok: true, settings, balances });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/spot/protection', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const settings = await readSpotRiskSettings();
    res.json({
      ok: true,
      settings: {
        max_slippage_bps: Number(settings.maxSlippageBps),
        max_deviation_bps: Number(settings.maxDeviationBps),
        candle_fetch_cap: settings.candleFetchCap,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/spot/protection', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const updates = SpotRiskSettingsSchema.parse(req.body || {});
    const tasks = [];
    if (updates.max_slippage_bps !== undefined)
      tasks.push(setPlatformSettingValue('spot_max_slippage_bps', updates.max_slippage_bps.toString()));
    if (updates.max_deviation_bps !== undefined)
      tasks.push(setPlatformSettingValue('spot_max_deviation_bps', updates.max_deviation_bps.toString()));
    if (updates.candle_fetch_cap !== undefined)
      tasks.push(setPlatformSettingValue('spot_candle_fetch_cap', updates.candle_fetch_cap.toString()));
    await Promise.all(tasks);
    const settings = await readSpotRiskSettings();
    res.json({
      ok: true,
      settings: {
        max_slippage_bps: Number(settings.maxSlippageBps),
        max_deviation_bps: Number(settings.maxDeviationBps),
        candle_fetch_cap: settings.candleFetchCap,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: err.message || 'Invalid input', details: err.flatten() });
    next(err);
  }
});

app.patch('/admin/fees', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const updates = AdminFeeUpdateSchema.parse(req.body || {});
    const tasks = [];
    if (updates.swap_fee_bps !== undefined)
      tasks.push(setPlatformSettingValue('swap_fee_bps', updates.swap_fee_bps.toString()));
    if (updates.spot_trade_fee_bps !== undefined)
      tasks.push(setPlatformSettingValue('spot_trade_fee_bps', updates.spot_trade_fee_bps.toString()));
    if (updates.spot_maker_fee_bps !== undefined)
      tasks.push(setPlatformSettingValue('spot_maker_fee_bps', updates.spot_maker_fee_bps.toString()));
    if (updates.spot_taker_fee_bps !== undefined)
      tasks.push(setPlatformSettingValue('spot_taker_fee_bps', updates.spot_taker_fee_bps.toString()));
    if (updates.transfer_fee_bps !== undefined)
      tasks.push(setPlatformSettingValue('transfer_fee_bps', updates.transfer_fee_bps.toString()));
    await Promise.all(tasks);
    const [settings, balances] = await Promise.all([readPlatformFeeSettings(), readPlatformFeeBalances()]);
    res.json({ ok: true, settings, balances });
  } catch (err) {
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: err.message || 'Invalid input', details: err.flatten() });
    next(err);
  }
});

app.get('/admin/ai/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const today = getTodayDateString();
    const [settings, stats] = await Promise.all([readAiSettings(), readAiUsageSummary(today)]);
    res.json({ ok: true, settings, stats, today });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/ai/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const payload = AiSettingsSchema.parse(req.body || {});
    const price = normalizePositiveDecimal(payload.message_price_eltx, 18);
    if (price === null)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid AI message price' });
    await Promise.all([
      setPlatformSettingValue(AI_DAILY_FREE_SETTING, payload.daily_free_messages.toString()),
      setPlatformSettingValue(AI_PRICE_SETTING, price),
    ]);
    const today = getTodayDateString();
    const [settings, stats] = await Promise.all([readAiSettings(), readAiUsageSummary(today)]);
    res.json({ ok: true, settings, stats, today });
  } catch (err) {
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid AI settings', details: err.flatten() });
    next(err);
  }
});

app.get('/admin/stripe/status', async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ ok: true, status: getStripeStatusPayload('admin') });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/admin-users', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { q, limit, offset } = AdminUsersQuerySchema.parse(req.query || {});
    const params = [];
    let sql =
      'SELECT id, email, username, role, is_active, last_login_at, created_at, updated_at FROM admin_users';
    if (q) {
      sql += ' WHERE email LIKE ? OR username LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.query(sql, params);
    res.json({
      ok: true,
      admins: rows.map((row) => presentAdminRow(row)),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid query', details: err.flatten() });
    }
    next(err);
  }
});

app.post('/admin/admin-users', async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    if (admin.role !== 'superadmin')
      return next({ status: 403, code: 'FORBIDDEN', message: 'Only superadmins can create admins' });
    const payload = AdminUserCreateSchema.parse(req.body || {});
    const passwordHash = await argon2.hash(payload.password);
    const isActive = payload.is_active === undefined ? 1 : payload.is_active ? 1 : 0;
    const [result] = await pool.query(
      'INSERT INTO admin_users (email, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [payload.email, payload.username, passwordHash, payload.role, isActive]
    );
    const insertedId = result.insertId;
    const [[row]] = await pool.query(
      'SELECT id, email, username, role, is_active, last_login_at, created_at, updated_at FROM admin_users WHERE id=?',
      [insertedId]
    );
    res.json({ ok: true, admin: presentAdminRow(row) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    if (err?.code === 'ER_DUP_ENTRY') {
      return next({ status: 409, code: 'DUPLICATE', message: 'Email or username already exists' });
    }
    next(err);
  }
});

app.patch('/admin/admin-users/:id', async (req, res, next) => {
  const adminId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(adminId) || adminId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid admin id' });
  try {
    const acting = await requireAdmin(req);
    if (acting.role !== 'superadmin' && acting.id !== adminId)
      return next({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
    const updates = AdminUserUpdateSchema.parse(req.body || {});
    if (updates.role && acting.role !== 'superadmin')
      return next({ status: 403, code: 'FORBIDDEN', message: 'Only superadmins can change roles' });
    if (updates.is_active === false && acting.id === adminId)
      return next({ status: 400, code: 'INVALID_OPERATION', message: 'Cannot disable your own account' });
    if (updates.role === 'manager' && acting.id === adminId)
      return next({ status: 400, code: 'INVALID_OPERATION', message: 'Cannot demote your own account' });

    const fields = [];
    const params = [];
    if (updates.email) {
      fields.push('email = ?');
      params.push(updates.email);
    }
    if (updates.username) {
      fields.push('username = ?');
      params.push(updates.username);
    }
    if (updates.role) {
      fields.push('role = ?');
      params.push(updates.role);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.is_active ? 1 : 0);
    }
    if (updates.password) {
      const hash = await argon2.hash(updates.password);
      fields.push('password_hash = ?');
      params.push(hash);
    }

    if (!fields.length) return next({ status: 400, code: 'BAD_INPUT', message: 'No fields to update' });

    params.push(adminId);

    await pool.query(`UPDATE admin_users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

    if ((updates.role || updates.is_active === false) && updates.role !== 'superadmin') {
      const [[superCount]] = await pool.query(
        'SELECT COUNT(*) AS total FROM admin_users WHERE role = "superadmin" AND is_active = 1'
      );
      const total = Number(superCount?.total || 0);
      if (total <= 0)
        return next({ status: 400, code: 'INVALID_OPERATION', message: 'At least one superadmin must remain active' });
    }

    const [[row]] = await pool.query(
      'SELECT id, email, username, role, is_active, last_login_at, created_at, updated_at FROM admin_users WHERE id=?',
      [adminId]
    );
    if (!row) return next({ status: 404, code: 'NOT_FOUND', message: 'Admin not found' });
    res.json({ ok: true, admin: presentAdminRow(row) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    if (err?.code === 'ER_DUP_ENTRY') {
      return next({ status: 409, code: 'DUPLICATE', message: 'Email or username already exists' });
    }
    next(err);
  }
});

app.get('/admin/users', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { q, limit, offset } = AdminUsersQuerySchema.parse(req.query || {});
    const params = [];
    let sql = 'SELECT id, email, username, language, created_at, updated_at FROM users';
    if (q) {
      sql += ' WHERE email LIKE ? OR username LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, users: rows });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid query', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/users/:id', async (req, res, next) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid user id' });
  try {
    await requireAdmin(req);
    const [[user]] = await pool.query(
      'SELECT id, email, username, language, created_at, updated_at FROM users WHERE id=?',
      [userId]
    );
    if (!user) return next({ status: 404, code: 'NOT_FOUND', message: 'User not found' });

    const [balancesRows] = await pool.query(
      'SELECT asset, balance_wei, created_at FROM user_balances WHERE user_id=? ORDER BY asset',
      [userId]
    );
    const balances = balancesRows.map((row) => {
      const symbol = (row.asset || '').toUpperCase();
      const decimals = getSymbolDecimals(symbol);
      const wei = bigIntFromValue(row.balance_wei || 0);
      return {
        asset: symbol,
        balance_wei: wei.toString(),
        balance: trimDecimal(formatUnitsStr(wei.toString(), decimals)),
        created_at: row.created_at,
      };
    });

    const [positionsRows] = await pool.query(
      `SELECT sp.id, sp.plan_id, sp.amount, sp.amount_wei, sp.apr_bps_snapshot, sp.start_date, sp.end_date, sp.status,
              sp.daily_reward, sp.accrued_total, sp.created_at, sp.updated_at, sp.stake_asset, sp.stake_decimals,
              p.name AS plan_name
         FROM staking_positions sp
         LEFT JOIN staking_plans p ON p.id = sp.plan_id
         WHERE sp.user_id=?
         ORDER BY sp.created_at DESC
         LIMIT 100`,
      [userId]
    );

    const staking = positionsRows.map((row) => {
      const decimals = Number(row.stake_decimals || 18);
      const amountWei = bigIntFromValue(row.amount_wei || 0);
      return {
        id: row.id,
        plan_id: row.plan_id,
        plan_name: row.plan_name,
        amount_wei: amountWei.toString(),
        amount: trimDecimal(formatUnitsStr(amountWei.toString(), decimals)),
        apr_bps_snapshot: Number(row.apr_bps_snapshot || 0),
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.status,
        daily_reward: trimDecimal(row.daily_reward),
        accrued_total: trimDecimal(row.accrued_total),
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    const [fiatRows] = await pool.query(
      `SELECT id, status, usd_amount, eltx_amount, price_eltx, created_at, updated_at
         FROM fiat_purchases
         WHERE user_id=?
         ORDER BY created_at DESC
         LIMIT 50`,
      [userId]
    );

    const fiat = fiatRows.map((row) => ({
      id: row.id,
      status: row.status,
      usd_amount: formatDecimalValue(row.usd_amount || 0, 2),
      eltx_amount: trimDecimal(row.eltx_amount),
      price_eltx: trimDecimal(row.price_eltx),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    const [depositRows] = await pool.query(
      `SELECT id, chain_id, token_symbol, token_address, amount_wei, status, confirmations, source, created_at
         FROM wallet_deposits
         WHERE user_id=?
         ORDER BY created_at DESC
         LIMIT 50`,
      [userId]
    );

    const deposits = depositRows.map((row) => {
      const symbol = (row.token_symbol || 'ELTX').toUpperCase();
      const decimals = getSymbolDecimals(symbol);
      const wei = bigIntFromValue(row.amount_wei || 0);
      return {
        id: row.id,
        asset: symbol,
        amount_wei: wei.toString(),
        amount: trimDecimal(formatUnitsStr(wei.toString(), decimals)),
        status: row.status,
        confirmations: row.confirmations,
        source: row.source,
        created_at: row.created_at,
      };
    });

    const [transferRows] = await pool.query(
      `SELECT id, from_user_id, to_user_id, asset, amount_wei, fee_wei, created_at
         FROM wallet_transfers
         WHERE from_user_id=? OR to_user_id=?
         ORDER BY created_at DESC
         LIMIT 50`,
      [userId, userId]
    );

    const transfers = transferRows.map((row) => {
      const symbol = (row.asset || 'ELTX').toUpperCase();
      const decimals = getSymbolDecimals(symbol);
      const wei = bigIntFromValue(row.amount_wei || 0);
      return {
        id: row.id,
        asset: symbol,
        amount_wei: wei.toString(),
        amount: trimDecimal(formatUnitsStr(wei.toString(), decimals)),
        from_user_id: row.from_user_id,
        to_user_id: row.to_user_id,
        fee_wei: bigIntFromValue(row.fee_wei || 0).toString(),
        created_at: row.created_at,
      };
    });

    res.json({ ok: true, user, balances, staking, fiat, deposits, transfers });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/users/:id', async (req, res, next) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid user id' });
  try {
    await requireAdmin(req);
    const updates = UserUpdateSchema.parse(req.body || {});
    const fields = [];
    const params = [];
    if (updates.email) {
      fields.push('email = ?');
      params.push(updates.email);
    }
    if (updates.username) {
      fields.push('username = ?');
      params.push(updates.username);
    }
    if (updates.language) {
      fields.push('language = ?');
      params.push(updates.language);
    }
    if (!fields.length) return next({ status: 400, code: 'BAD_INPUT', message: 'No fields to update' });
    params.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    const [[user]] = await pool.query(
      'SELECT id, email, username, language, created_at, updated_at FROM users WHERE id=?',
      [userId]
    );
    res.json({ ok: true, user });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    if (err?.code === 'ER_DUP_ENTRY') {
      return next({ status: 409, code: 'DUPLICATE', message: 'Email or username already exists' });
    }
    next(err);
  }
});

app.post('/admin/users/:id/reset-password', async (req, res, next) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid user id' });
  try {
    await requireAdmin(req);
    const { password } = AdminPasswordResetSchema.parse(req.body || {});
    const hash = await argon2.hash(password);
    await pool.query(
      'INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
      [userId, hash]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/users/:id/balances', async (req, res, next) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid user id' });
  try {
    await requireAdmin(req);
    const [rows] = await pool.query(
      'SELECT asset, balance_wei, created_at FROM user_balances WHERE user_id=? ORDER BY asset',
      [userId]
    );
    const balances = rows.map((row) => {
      const symbol = (row.asset || '').toUpperCase();
      const decimals = getSymbolDecimals(symbol);
      const wei = bigIntFromValue(row.balance_wei || 0);
      return {
        asset: symbol,
        balance_wei: wei.toString(),
        balance: trimDecimal(formatUnitsStr(wei.toString(), decimals)),
        created_at: row.created_at,
      };
    });
    res.json({ ok: true, balances });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/users/:id/balances/adjust', async (req, res, next) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid user id' });
  let conn;
  try {
    const admin = await requireAdmin(req);
    const payload = AdminBalanceAdjustSchema.parse(req.body || {});
    const asset = payload.asset.toUpperCase();
    const decimals = getSymbolDecimals(asset);
    const weiStr = decimalToWeiString(payload.amount, decimals);
    if (!weiStr) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    const wei = BigInt(weiStr);
    if (wei <= 0n) return next({ status: 400, code: 'BAD_INPUT', message: 'Amount must be positive' });

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [balanceRows] = await conn.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
      [userId, asset]
    );
    let currentWei = balanceRows.length ? bigIntFromValue(balanceRows[0].balance_wei || 0) : 0n;

    if (payload.direction === 'debit') {
      if (currentWei < wei) {
        await conn.rollback();
        return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
      }
      currentWei -= wei;
      await conn.query('UPDATE user_balances SET balance_wei = ? WHERE user_id=? AND UPPER(asset)=?', [
        currentWei.toString(),
        userId,
        asset,
      ]);
    } else {
      currentWei += wei;
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance_wei = VALUES(balance_wei)',
        [userId, asset, currentWei.toString()]
      );
    }

    await conn.query(
      'INSERT INTO admin_balance_adjustments (admin_id, user_id, asset, amount_change_wei, direction, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [admin.id, userId, asset, wei.toString(), payload.direction, payload.reason || null]
    );

    await conn.commit();

    res.json({
      ok: true,
      balance: {
        asset,
        balance_wei: currentWei.toString(),
        balance: trimDecimal(formatUnitsStr(currentWei.toString(), decimals)),
      },
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/admin/transactions', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { type, limit, offset } = AdminTransactionsQuerySchema.parse(req.query || {});
    let results = [];

    if (type === 'deposits') {
      const [rows] = await pool.query(
        `SELECT id, user_id, token_symbol, token_address, amount_wei, confirmations, status, source, created_at
           FROM wallet_deposits
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      results = rows.map((row) => {
        const symbol = (row.token_symbol || 'ELTX').toUpperCase();
        const decimals = getSymbolDecimals(symbol);
        const wei = bigIntFromValue(row.amount_wei || 0);
        return {
          id: row.id,
          user_id: row.user_id,
          asset: symbol,
          amount_wei: wei.toString(),
          amount: trimDecimal(formatUnitsStr(wei.toString(), decimals)),
          confirmations: row.confirmations,
          status: row.status,
          source: row.source,
          created_at: row.created_at,
        };
      });
    } else if (type === 'transfers') {
      const [rows] = await pool.query(
        `SELECT id, from_user_id, to_user_id, asset, amount_wei, fee_wei, created_at
           FROM wallet_transfers
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      results = rows.map((row) => {
        const symbol = (row.asset || 'ELTX').toUpperCase();
        const decimals = getSymbolDecimals(symbol);
        const wei = bigIntFromValue(row.amount_wei || 0);
        return {
          id: row.id,
          from_user_id: row.from_user_id,
          to_user_id: row.to_user_id,
          asset: symbol,
          amount_wei: wei.toString(),
          amount: trimDecimal(formatUnitsStr(wei.toString(), decimals)),
          fee_wei: bigIntFromValue(row.fee_wei || 0).toString(),
          created_at: row.created_at,
        };
      });
    } else if (type === 'swaps') {
      const [rows] = await pool.query(
        `SELECT id, user_id, asset, asset_decimals, target_decimals, asset_amount_wei, eltx_amount_wei, price_wei, fee_amount_wei, created_at
           FROM trade_swaps
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      results = rows.map((row) => {
        const asset = (row.asset || '').toUpperCase();
        const assetDecimals = Number(row.asset_decimals || getSymbolDecimals(asset));
        const eltxDecimals = Number(row.target_decimals || getSymbolDecimals(ELTX_SYMBOL));
        const assetWei = bigIntFromValue(row.asset_amount_wei || 0);
        const eltxWei = bigIntFromValue(row.eltx_amount_wei || 0);
        return {
          id: row.id,
          user_id: row.user_id,
          asset,
          asset_amount_wei: assetWei.toString(),
          asset_amount: trimDecimal(formatUnitsStr(assetWei.toString(), assetDecimals)),
          eltx_amount_wei: eltxWei.toString(),
          eltx_amount: trimDecimal(formatUnitsStr(eltxWei.toString(), eltxDecimals)),
          price_eltx: trimDecimal(formatUnitsStr(bigIntFromValue(row.price_wei || 0).toString(), 18)),
          fee_amount_wei: bigIntFromValue(row.fee_amount_wei || 0).toString(),
          created_at: row.created_at,
        };
      });
    } else if (type === 'spot') {
      const [rows] = await pool.query(
        `SELECT st.id, st.market_id, st.price_wei, st.base_amount_wei, st.quote_amount_wei, st.buy_order_id, st.sell_order_id,
                st.taker_side, st.created_at,
                sm.symbol, sm.base_decimals, sm.quote_decimals,
                bo.user_id AS buy_user_id, so.user_id AS sell_user_id
           FROM spot_trades st
           JOIN spot_markets sm ON sm.id = st.market_id
           JOIN spot_orders bo ON bo.id = st.buy_order_id
           JOIN spot_orders so ON so.id = st.sell_order_id
           ORDER BY st.created_at DESC
           LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      results = rows.map((row) => {
        const baseWei = bigIntFromValue(row.base_amount_wei || 0);
        const quoteWei = bigIntFromValue(row.quote_amount_wei || 0);
        return {
          id: row.id,
          market: row.symbol,
          buy_user_id: row.buy_user_id,
          sell_user_id: row.sell_user_id,
          price: trimDecimal(formatUnitsStr(bigIntFromValue(row.price_wei || 0).toString(), 18)),
          base_amount: trimDecimal(
            formatUnitsStr(baseWei.toString(), Number(row.base_decimals || 18))
          ),
          quote_amount: trimDecimal(
            formatUnitsStr(quoteWei.toString(), Number(row.quote_decimals || 18))
          ),
          taker_side: row.taker_side,
          created_at: row.created_at,
        };
      });
    } else if (type === 'fiat') {
      const [rows] = await pool.query(
        `SELECT id, user_id, status, usd_amount, eltx_amount, price_eltx, created_at, completed_at
           FROM fiat_purchases
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      results = rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        status: row.status,
        usd_amount: formatDecimalValue(row.usd_amount || 0, 2),
        eltx_amount: trimDecimal(row.eltx_amount),
        price_eltx: trimDecimal(row.price_eltx),
        created_at: row.created_at,
        completed_at: row.completed_at,
      }));
    }

    res.json({ ok: true, type, results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid query', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/staking/plans', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const [rows] = await pool.query(
      `SELECT id, name, duration_days, apr_bps, stake_asset, stake_decimals, min_deposit_wei, is_active, created_at, updated_at
         FROM staking_plans
         ORDER BY id ASC`
    );
    const plans = rows.map((row) => {
      const asset = (row.stake_asset || 'ELTX').toUpperCase();
      const decimals = Number(row.stake_decimals || getSymbolDecimals(asset));
      const minWei = bigIntFromValue(row.min_deposit_wei || 0);
      return {
        id: row.id,
        name: row.name,
        duration_days: row.duration_days,
        apr_bps: row.apr_bps,
        stake_asset: asset,
        stake_decimals: decimals,
        min_deposit_wei: minWei.toString(),
        min_deposit: minWei > 0n ? trimDecimal(formatUnitsStr(minWei.toString(), decimals)) : null,
        is_active: !!row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
    res.json({ ok: true, plans });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/staking/plans', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const payload = AdminStakingPlanCreateSchema.parse(req.body || {});
    const asset = payload.stake_asset.toUpperCase();
    const decimals = Number(payload.stake_decimals ?? getSymbolDecimals(asset));
    const minWei = payload.min_deposit ? decimalToWeiString(payload.min_deposit, decimals) : null;
    if (payload.min_deposit && !minWei)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid minimum deposit amount' });
    const [result] = await pool.query(
      `INSERT INTO staking_plans (name, duration_days, apr_bps, stake_asset, stake_decimals, min_deposit_wei, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)` ,
      [
        payload.name,
        payload.duration_days,
        payload.apr_bps,
        asset,
        decimals,
        minWei || null,
        payload.is_active === false ? 0 : 1,
      ]
    );
    const id = result.insertId;
    const [[row]] = await pool.query(
      `SELECT id, name, duration_days, apr_bps, stake_asset, stake_decimals, min_deposit_wei, is_active, created_at, updated_at
         FROM staking_plans WHERE id=?`,
      [id]
    );
    res.json({ ok: true, plan: row });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.patch('/admin/staking/plans/:id', async (req, res, next) => {
  const planId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(planId) || planId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid plan id' });
  try {
    await requireAdmin(req);
    const updates = AdminStakingPlanUpdateSchema.parse(req.body || {});
    const fields = [];
    const params = [];
    if (updates.name) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.duration_days !== undefined) {
      fields.push('duration_days = ?');
      params.push(updates.duration_days);
    }
    if (updates.apr_bps !== undefined) {
      fields.push('apr_bps = ?');
      params.push(updates.apr_bps);
    }
    if (updates.stake_asset) {
      fields.push('stake_asset = ?');
      params.push(updates.stake_asset.toUpperCase());
    }
    if (updates.stake_decimals !== undefined) {
      fields.push('stake_decimals = ?');
      params.push(updates.stake_decimals);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.is_active ? 1 : 0);
    }
    if (updates.min_deposit !== undefined) {
      const asset = updates.stake_asset ? updates.stake_asset.toUpperCase() : undefined;
      const decimals =
        updates.stake_decimals !== undefined
          ? updates.stake_decimals
          : Number(asset ? getSymbolDecimals(asset) : 18);
      const minWei = updates.min_deposit ? decimalToWeiString(updates.min_deposit, decimals) : null;
      if (updates.min_deposit && !minWei)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid minimum deposit amount' });
      fields.push('min_deposit_wei = ?');
      params.push(minWei || null);
    }
    if (!fields.length) return next({ status: 400, code: 'BAD_INPUT', message: 'No fields to update' });
    params.push(planId);
    await pool.query(`UPDATE staking_plans SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    const [[row]] = await pool.query(
      `SELECT id, name, duration_days, apr_bps, stake_asset, stake_decimals, min_deposit_wei, is_active, created_at, updated_at
         FROM staking_plans WHERE id=?`,
      [planId]
    );
    if (!row) return next({ status: 404, code: 'NOT_FOUND', message: 'Plan not found' });
    res.json({ ok: true, plan: row });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/staking/positions', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { status, limit, offset } = AdminStakingPositionsQuerySchema.parse(req.query || {});
    const params = [];
    let sql =
      `SELECT sp.id, sp.user_id, sp.plan_id, sp.amount_wei, sp.apr_bps_snapshot, sp.status, sp.start_date, sp.end_date, sp.daily_reward,
              sp.accrued_total, sp.created_at, sp.updated_at, sp.stake_asset, sp.stake_decimals, sp.principal_redeemed,
              p.name AS plan_name
         FROM staking_positions sp
         LEFT JOIN staking_plans p ON p.id = sp.plan_id`;
    if (status !== 'all') {
      sql += ' WHERE sp.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY sp.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.query(sql, params);
    const positions = rows.map((row) => {
      const decimals = Number(row.stake_decimals || getSymbolDecimals(row.stake_asset || 'ELTX'));
      const amountWei = bigIntFromValue(row.amount_wei || 0);
      return {
        id: row.id,
        user_id: row.user_id,
        plan_id: row.plan_id,
        plan_name: row.plan_name,
        amount_wei: amountWei.toString(),
        amount: trimDecimal(formatUnitsStr(amountWei.toString(), decimals)),
        apr_bps_snapshot: row.apr_bps_snapshot,
        status: row.status,
        start_date: row.start_date,
        end_date: row.end_date,
        daily_reward: trimDecimal(row.daily_reward),
        accrued_total: trimDecimal(row.accrued_total),
        principal_redeemed: !!row.principal_redeemed,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
    res.json({ ok: true, positions });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid query', details: err.flatten() });
    }
    next(err);
  }
});

app.patch('/admin/staking/positions/:id', async (req, res, next) => {
  const positionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(positionId) || positionId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid position id' });
  try {
    await requireAdmin(req);
    const { status } = AdminStakingPositionUpdateSchema.parse(req.body || {});
    await pool.query('UPDATE staking_positions SET status=?, updated_at=NOW() WHERE id=?', [status, positionId]);
    const [[row]] = await pool.query(
      `SELECT sp.id, sp.user_id, sp.plan_id, sp.amount_wei, sp.apr_bps_snapshot, sp.status, sp.start_date, sp.end_date,
              sp.daily_reward, sp.accrued_total, sp.created_at, sp.updated_at, sp.stake_asset, sp.stake_decimals,
              p.name AS plan_name
         FROM staking_positions sp
         LEFT JOIN staking_plans p ON p.id = sp.plan_id
         WHERE sp.id=?`,
      [positionId]
    );
    if (!row) return next({ status: 404, code: 'NOT_FOUND', message: 'Position not found' });
    res.json({ ok: true, position: row });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.post('/admin/staking/settle', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { positionId } = req.body || {};
    const summary = await settleStakingPositions({ positionId });
    res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/pricing', async (req, res, next) => {
  try {
    await requireAdmin(req);
    try {
      await syncSwapAssetPrices(pool);
    } catch (err) {
      console.warn('[admin] swap price sync skipped', err?.message || err);
    }
    const [swapRows] = await pool.query(
      `SELECT ap.asset, ap.price_eltx, ap.min_amount, ap.max_amount, ap.spread_bps, ap.updated_at,
              lp.asset_reserve_wei, lp.eltx_reserve_wei, lp.asset_decimals
         FROM asset_prices ap
         LEFT JOIN swap_liquidity_pools lp ON UPPER(lp.asset) = UPPER(ap.asset)
         ORDER BY ap.asset`
    );
    const [spotRows] = await pool.query(
      `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals,
              min_base_amount, min_quote_amount, price_precision, amount_precision, active, created_at, updated_at
         FROM spot_markets
         ORDER BY symbol`
    );
    const swap = swapRows.map((row) => {
      const asset = (row.asset || '').toUpperCase();
      return {
        asset,
        price_eltx: trimDecimal(row.price_eltx),
        min_amount: trimDecimal(row.min_amount),
        max_amount: row.max_amount !== null && row.max_amount !== undefined ? trimDecimal(row.max_amount) : null,
        spread_bps: Number(row.spread_bps || 0),
        asset_reserve_wei: bigIntFromValue(row.asset_reserve_wei || 0).toString(),
        eltx_reserve_wei: bigIntFromValue(row.eltx_reserve_wei || 0).toString(),
        asset_decimals: Number(row.asset_decimals || getSymbolDecimals(asset)),
        updated_at: row.updated_at,
      };
    });
    const spot = spotRows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      base_asset: row.base_asset,
      quote_asset: row.quote_asset,
      base_decimals: row.base_decimals,
      quote_decimals: row.quote_decimals,
      min_base_amount: trimDecimal(row.min_base_amount),
      min_quote_amount: trimDecimal(row.min_quote_amount),
      price_precision: row.price_precision,
      amount_precision: row.amount_precision,
      active: !!row.active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    res.json({ ok: true, swap, spot });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/pricing/swap/:asset', async (req, res, next) => {
  const asset = req.params.asset?.toUpperCase();
  if (!asset) return next({ status: 400, code: 'BAD_INPUT', message: 'Asset required' });
  try {
    await requireAdmin(req);
    const updates = AdminSwapPriceUpdateSchema.parse(req.body || {});
    const [[row]] = await pool.query('SELECT asset FROM asset_prices WHERE UPPER(asset)=? LIMIT 1', [asset]);
    if (!row) return next({ status: 404, code: 'NOT_FOUND', message: 'Asset not found' });

    const fields = [];
    const params = [];
    if (updates.price_eltx !== undefined) {
      const normalized = normalizePositiveDecimal(updates.price_eltx, 18);
      if (!normalized) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid price value' });
      fields.push('price_eltx = ?');
      params.push(normalized);
    }
    if (updates.min_amount !== undefined) {
      const normalized = normalizePositiveDecimal(updates.min_amount, 18);
      if (normalized === null)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid minimum amount' });
      fields.push('min_amount = ?');
      params.push(normalized);
    }
    if (updates.max_amount !== undefined) {
      if (updates.max_amount === null) {
        fields.push('max_amount = NULL');
      } else {
        const normalized = normalizePositiveDecimal(updates.max_amount, 18);
        if (!normalized)
          return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid maximum amount' });
        fields.push('max_amount = ?');
        params.push(normalized);
      }
    }
    if (updates.spread_bps !== undefined) {
      fields.push('spread_bps = ?');
      params.push(updates.spread_bps);
    }

    if (fields.length) {
      params.push(asset);
      await pool.query(`UPDATE asset_prices SET ${fields.join(', ')}, updated_at = NOW() WHERE UPPER(asset)=?`, params);
    }

    if (updates.asset_reserve_wei !== undefined || updates.eltx_reserve_wei !== undefined) {
      let assetReserve = null;
      let eltxReserve = null;
      if (updates.asset_reserve_wei !== undefined) {
        try {
          assetReserve = BigInt(updates.asset_reserve_wei);
          if (assetReserve < 0n) throw new Error('negative reserve');
        } catch {
          return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid asset reserve value' });
        }
      }
      if (updates.eltx_reserve_wei !== undefined) {
        try {
          eltxReserve = BigInt(updates.eltx_reserve_wei);
          if (eltxReserve < 0n) throw new Error('negative reserve');
        } catch {
          return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ELTX reserve value' });
        }
      }
      const [poolRows] = await pool.query('SELECT asset FROM swap_liquidity_pools WHERE UPPER(asset)=? LIMIT 1', [asset]);
      if (!poolRows.length) {
        await pool.query(
          'INSERT INTO swap_liquidity_pools (asset, asset_decimals, asset_reserve_wei, eltx_reserve_wei) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE asset_reserve_wei=VALUES(asset_reserve_wei), eltx_reserve_wei=VALUES(eltx_reserve_wei)',
          [asset, getSymbolDecimals(asset), assetReserve?.toString() || '0', eltxReserve?.toString() || '0']
        );
      } else {
        const poolFields = [];
        const poolParams = [];
        if (assetReserve !== null) {
          poolFields.push('asset_reserve_wei = ?');
          poolParams.push(assetReserve.toString());
        }
        if (eltxReserve !== null) {
          poolFields.push('eltx_reserve_wei = ?');
          poolParams.push(eltxReserve.toString());
        }
        if (poolFields.length) {
          poolParams.push(asset);
          await pool.query(`UPDATE swap_liquidity_pools SET ${poolFields.join(', ')}, updated_at = NOW() WHERE UPPER(asset)=?`, poolParams);
        }
      }
    }

    const [[updated]] = await pool.query(
      `SELECT ap.asset, ap.price_eltx, ap.min_amount, ap.max_amount, ap.spread_bps, ap.updated_at,
              lp.asset_reserve_wei, lp.eltx_reserve_wei, lp.asset_decimals
         FROM asset_prices ap
         LEFT JOIN swap_liquidity_pools lp ON UPPER(lp.asset) = UPPER(ap.asset)
         WHERE UPPER(ap.asset)=?`,
      [asset]
    );
    res.json({ ok: true, asset: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.patch('/admin/pricing/spot/:symbol', async (req, res, next) => {
  const symbol = normalizeMarketSymbol(req.params.symbol || '');
  if (!symbol) return next({ status: 400, code: 'BAD_INPUT', message: 'Market symbol required' });
  try {
    await requireAdmin(req);
    const updates = AdminSpotMarketUpdateSchema.parse(req.body || {});
    const [[row]] = await pool.query('SELECT id FROM spot_markets WHERE symbol=? LIMIT 1', [symbol]);
    if (!row) return next({ status: 404, code: 'NOT_FOUND', message: 'Market not found' });
    const fields = [];
    const params = [];
    if (updates.min_base_amount !== undefined) {
      const normalized = normalizePositiveDecimal(updates.min_base_amount, 18);
      if (normalized === null)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid base minimum amount' });
      fields.push('min_base_amount = ?');
      params.push(normalized);
    }
    if (updates.min_quote_amount !== undefined) {
      const normalized = normalizePositiveDecimal(updates.min_quote_amount, 18);
      if (normalized === null)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid quote minimum amount' });
      fields.push('min_quote_amount = ?');
      params.push(normalized);
    }
    if (updates.price_precision !== undefined) {
      fields.push('price_precision = ?');
      params.push(updates.price_precision);
    }
    if (updates.amount_precision !== undefined) {
      fields.push('amount_precision = ?');
      params.push(updates.amount_precision);
    }
    if (updates.active !== undefined) {
      fields.push('active = ?');
      params.push(updates.active ? 1 : 0);
    }
    if (!fields.length) return next({ status: 400, code: 'BAD_INPUT', message: 'No fields to update' });
    params.push(symbol);
    await pool.query(`UPDATE spot_markets SET ${fields.join(', ')}, updated_at = NOW() WHERE symbol = ?`, params);
    const [[market]] = await pool.query(
      `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount,
              price_precision, amount_precision, active, created_at, updated_at
         FROM spot_markets WHERE symbol=?`,
      [symbol]
    );
    res.json({ ok: true, market });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/fiat/purchases', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { limit, offset } = PaginationSchema.parse(req.query || {});
    const [rows] = await pool.query(
      `SELECT id, user_id, status, currency, usd_amount, price_eltx, eltx_amount, eltx_amount_wei,
              credited, created_at, updated_at, completed_at, credited_at, stripe_session_id, stripe_payment_intent_id
         FROM fiat_purchases
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const purchases = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      status: row.status,
      currency: row.currency,
      usd_amount: formatDecimalValue(row.usd_amount || 0, 2),
      price_eltx: trimDecimal(row.price_eltx),
      eltx_amount: trimDecimal(row.eltx_amount),
      eltx_amount_wei: bigIntFromValue(row.eltx_amount_wei || 0).toString(),
      credited: !!row.credited,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      credited_at: row.credited_at,
      stripe_session_id: row.stripe_session_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
    }));
    res.json({ ok: true, purchases });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid query', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/ai/status', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const today = getTodayDateString();
    const [settings, usageRow, balanceRows] = await Promise.all([
      readAiSettings(),
      getAiUsageRow(pool, userId, today),
      pool.query('SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=?', [userId, ELTX_SYMBOL]),
    ]);
    const decimals = getSymbolDecimals(ELTX_SYMBOL);
    const [[balanceRaw]] = balanceRows;
    const balanceWei = bigIntFromValue(balanceRaw?.balance_wei || 0);
    const priceWei = bigIntFromValue(decimalToWeiString(settings.message_price_eltx, decimals) || 0);
    const usage = presentAiUsageRow(usageRow, settings, decimals);
    const balance = trimDecimal(formatUnitsStr(balanceWei.toString(), decimals));
    const canAffordPaid = priceWei > 0n && balanceWei >= priceWei;
    const canMessage = usage.free_remaining > 0 || canAffordPaid;
    res.json({
      ok: true,
      settings,
      usage,
      balance: { eltx_balance_wei: balanceWei.toString(), eltx_balance: balance },
      pricing: { message_price_eltx: settings.message_price_eltx, message_price_wei: priceWei.toString() },
      can_message: canMessage,
      can_afford_paid: canAffordPaid,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/ai/chat', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    if (!openaiClient)
      return next({ status: 503, code: 'AI_DISABLED', message: 'AI service is not configured' });
    const payload = AiChatSchema.parse(req.body || {});
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const today = getTodayDateString();
    const settings = await readAiSettings(conn);
    const decimals = getSymbolDecimals(ELTX_SYMBOL);
    const priceWei = bigIntFromValue(decimalToWeiString(settings.message_price_eltx, decimals) || 0);
    let usageRow = await getAiUsageRow(conn, userId, today, { forUpdate: true });
    if (!usageRow) {
      await conn.query('INSERT INTO ai_daily_usage (user_id, usage_date) VALUES (?, ?) ON DUPLICATE KEY UPDATE usage_date=usage_date', [
        userId,
        today,
      ]);
      usageRow = await getAiUsageRow(conn, userId, today, { forUpdate: true });
    }

    let chargeType = 'free';
    let balanceWei = 0n;
    if (usageRow.messages_used >= settings.daily_free_messages) {
      if (priceWei <= 0n) {
        await conn.rollback();
        return next({ status: 400, code: 'AI_PRICE_REQUIRED', message: 'Message price must be set above zero.' });
      }
      const [[balanceRaw]] = await conn.query(
        'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
        [userId, ELTX_SYMBOL]
      );
      balanceWei = bigIntFromValue(balanceRaw?.balance_wei || 0);
      if (balanceWei < priceWei) {
        await conn.rollback();
        return next({
          status: 402,
          code: 'INSUFFICIENT_ELTX',
          message: 'Insufficient ELTX balance for AI message',
          details: {
            balance: trimDecimal(formatUnitsStr(balanceWei.toString(), decimals)),
            required: trimDecimal(formatUnitsStr(priceWei.toString(), decimals)),
          },
        });
      }
      chargeType = 'eltx';
    }

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: payload.messages,
    });
    const message = completion.choices?.[0]?.message;
    if (!message || !message.content) {
      await conn.rollback();
      return next({ status: 502, code: 'AI_EMPTY_RESPONSE', message: 'AI did not return a message' });
    }

    if (chargeType === 'free') {
      await conn.query(
        'UPDATE ai_daily_usage SET messages_used = messages_used + 1, last_message_at = NOW() WHERE user_id=? AND usage_date=?',
        [userId, today]
      );
      await conn.query('INSERT INTO ai_message_ledger (user_id, usage_date, charge_type, asset, amount_wei) VALUES (?,?,?,?,?)', [
        userId,
        today,
        'free',
        ELTX_SYMBOL,
        0,
      ]);
    } else {
      const newBalanceWei = balanceWei - priceWei;
      await conn.query('UPDATE user_balances SET balance_wei = ? WHERE user_id=? AND UPPER(asset)=?', [
        newBalanceWei.toString(),
        userId,
        ELTX_SYMBOL,
      ]);
      await conn.query(
        'UPDATE ai_daily_usage SET messages_used = messages_used + 1, paid_messages = paid_messages + 1, eltx_spent_wei = eltx_spent_wei + ?, last_message_at = NOW() WHERE user_id=? AND usage_date=?',
        [priceWei.toString(), userId, today]
      );
      await conn.query('INSERT INTO ai_message_ledger (user_id, usage_date, charge_type, asset, amount_wei) VALUES (?,?,?,?,?)', [
        userId,
        today,
        'eltx',
        ELTX_SYMBOL,
        priceWei.toString(),
      ]);
    }

    await conn.commit();

    const [usageRowUpdated, balanceRows] = await Promise.all([
      getAiUsageRow(pool, userId, today),
      pool.query('SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=?', [userId, ELTX_SYMBOL]),
    ]);
    const [[balanceRaw]] = balanceRows;
    const balanceUpdatedWei = bigIntFromValue(balanceRaw?.balance_wei || 0);
    const usage = presentAiUsageRow(usageRowUpdated, settings, decimals);
    res.json({
      ok: true,
      message,
      usage,
      charge_type: chargeType,
      pricing: { message_price_eltx: settings.message_price_eltx, message_price_wei: priceWei.toString() },
      balance: {
        eltx_balance_wei: balanceUpdatedWei.toString(),
        eltx_balance: trimDecimal(formatUnitsStr(balanceUpdatedWei.toString(), decimals)),
      },
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid messages payload', details: err.flatten() });
    next(err);
  } finally {
    if (conn) conn.release();
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

app.get('/wallet/assets', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const transferFeeVal = await getPlatformSettingValue('transfer_fee_bps', '0');
    const transferFeeBps = Number(clampBps(BigInt(Number.parseInt(transferFeeVal, 10) || 0)));
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

    res.json({ ok: true, assets, transfer_fee_bps: transferFeeBps });
  } catch (err) {
    next(err);
  }
});

app.get('/trade/markets', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [marketRows] = await pool.query(
      `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_quote_amount, active
         FROM spot_markets
        WHERE UPPER(base_asset)=? AND active=1
        ORDER BY quote_asset`,
      [ELTX_SYMBOL]
    );
    if (!marketRows.length)
      return res.json({
        ok: true,
        markets: [],
        baseAsset: { symbol: ELTX_SYMBOL, decimals: getSymbolDecimals(ELTX_SYMBOL) },
        pricing: { mode: 'spot' },
      });

    const quoteAssets = marketRows.map((row) => (row.quote_asset || '').toUpperCase());
    const [balanceRows] = await pool.query(
      `SELECT UPPER(asset) AS asset, balance_wei
         FROM user_balances
        WHERE user_id=? AND UPPER(asset) IN (${quoteAssets.map(() => '?').join(',')})`,
      [userId, ...quoteAssets]
    );
    const balanceMap = new Map();
    for (const row of balanceRows) balanceMap.set((row.asset || '').toUpperCase(), bigIntFromValue(row.balance_wei));

    const topOfBook = await Promise.all(marketRows.map((row) => getSpotTopOfBook(pool, row.id)));

    const markets = marketRows.map((row, idx) => {
      const symbol = (row.quote_asset || '').toUpperCase();
      const decimals = Number(row.quote_decimals || getSymbolDecimals(symbol));
      const balanceWei = balanceMap.get(symbol) || 0n;
      const { ask, bid } = topOfBook[idx];
      let rateWei = 0n;
      if (ask && ask > 0n) rateWei = mulDiv(PRICE_SCALE, PRICE_SCALE, ask);
      const spreadBps = ask && bid && ask > 0n && bid > 0n ? Number(((ask - bid) * 10000n) / ask) : 0;
      return {
        asset: symbol,
        decimals,
        price_eltx: trimDecimal(formatUnitsStr(rateWei.toString(), 18)),
        min_amount: trimDecimal((row.min_quote_amount || '0').toString()),
        max_amount: null,
        spread_bps: Number.isFinite(spreadBps) ? spreadBps : 0,
        updated_at: new Date().toISOString(),
        balance_wei: balanceWei.toString(),
        balance: trimDecimal(formatUnitsStr(balanceWei.toString(), decimals)),
      };
    });
    const baseDecimals = getSymbolDecimals(ELTX_SYMBOL);
    res.json({
      ok: true,
      markets,
      baseAsset: { symbol: ELTX_SYMBOL, decimals: baseDecimals },
      pricing: { mode: 'spot' },
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
    const feeVal = await getPlatformSettingValue('transfer_fee_bps', '0', conn);
    const feeBps = Number(clampBps(BigInt(Number.parseInt(feeVal, 10) || 0)));
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

    const market = await getSpotMarketForSwap(asset);
    if (!market)
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });

    const assetDecimals = Number(market.quote_decimals || getSymbolDecimals(asset));
    const targetDecimals = Number(market.base_decimals || getSymbolDecimals(ELTX_SYMBOL));
    let amountWei;
    try {
      amountWei = ethers.parseUnits(amount, assetDecimals);
    } catch {
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Invalid amount' });
    }
    if (amountWei <= 0n)
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be greater than zero' });

    const minQuoteStr = (market.min_quote_amount || '0').toString();
    if (!isZeroDecimal(minQuoteStr)) {
      const minWei = ethers.parseUnits(minQuoteStr, assetDecimals);
      if (amountWei < minWei)
        return next({ status: 400, code: 'AMOUNT_TOO_SMALL', message: 'Amount below minimum' });
    }

    let swapFeeBps = 0n;
    try {
      const feeVal = await getPlatformSettingValue('swap_fee_bps', '50');
      swapFeeBps = clampBps(BigInt(Number.parseInt(feeVal, 10) || 0));
    } catch {}

    const sim = await simulateSpotMarketBuy(pool, market, amountWei, swapFeeBps);
    if (sim.filledBase <= 0n)
      return next({ status: 400, code: 'INSUFFICIENT_LIQUIDITY', message: 'Liquidity insufficient for this swap' });

    const netEltxWei = sim.filledBase;
    const rateWei = netEltxWei > 0n ? mulDiv(netEltxWei, PRICE_SCALE, amountWei) : 0n;
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
        trimDecimal(formatUnitsStr(rateWei.toString(), 18)),
        rateWei.toString(),
        0,
        Number(swapFeeBps),
        asset,
        sim.takerFee.toString(),
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
        price_eltx: trimDecimal(formatUnitsStr(rateWei.toString(), 18)),
        rate: trimDecimal(formatUnitsStr(rateWei.toString(), 18)),
        spread_bps: 0,
        fee_bps: Number(swapFeeBps),
        fee_asset: asset,
        fee_amount: trimDecimal(formatUnitsStr(sim.takerFee.toString(), assetDecimals)),
        fee_amount_wei: sim.takerFee.toString(),
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
    const assetDecimals = Number(quoteRow.asset_decimals || getSymbolDecimals(asset));
    const targetDecimals = Number(quoteRow.target_decimals || getSymbolDecimals(ELTX_SYMBOL));
    const amountWei = BigInt(quoteRow.asset_amount_wei);
    const eltxWei = BigInt(quoteRow.eltx_amount_wei);
    const swapFeeBps = clampBps(BigInt(quoteRow.fee_bps || 0));

    const market = await getSpotMarketForSwap(asset, conn);
    if (!market) {
      await conn.rollback();
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Asset not supported for swap' });
    }
    const baseAsset = (market.base_asset || ELTX_SYMBOL).toUpperCase();

    const [balRows] = await conn.query(
      'SELECT asset, balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
      [userId, asset]
    );
    const balanceWei = balRows.length ? bigIntFromValue(balRows[0].balance_wei) : 0n;
    if (balanceWei < amountWei) {
      await conn.rollback();
      await pool.query('UPDATE trade_quotes SET status="failed", executed_at=NOW() WHERE id=?', [quote_id]);
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }

    const [orderInsert] = await conn.query(
      'INSERT INTO spot_orders (market_id, user_id, side, type, price_wei, base_amount_wei, quote_amount_wei, remaining_base_wei, remaining_quote_wei, fee_bps, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [
        market.id,
        userId,
        'buy',
        'market',
        '0',
        eltxWei.toString(),
        '0',
        eltxWei.toString(),
        '0',
        Number(swapFeeBps),
        'open',
      ]
    );
    const orderId = orderInsert.insertId;
    const taker = {
      id: orderId,
      userId,
      side: 'buy',
      type: 'market',
      priceWei: 0n,
      remainingBase: eltxWei,
      remainingQuote: 0n,
      availableQuote: amountWei,
      feeBps: swapFeeBps,
    };

    const matchResult = await matchSpotOrder(conn, market, taker, { feeType: 'swap' });

    if (matchResult.filledBase <= 0n) {
      await conn.query('UPDATE spot_orders SET status="cancelled", remaining_base_wei=0, remaining_quote_wei=0 WHERE id=?', [orderId]);
      await conn.rollback();
      await pool.query('UPDATE trade_quotes SET status="failed", executed_at=NOW() WHERE id=?', [quote_id]);
      return next({ status: 400, code: 'INSUFFICIENT_LIQUIDITY', message: 'Liquidity insufficient to settle quote' });
    }

    if (matchResult.filledBase < eltxWei) {
      await conn.rollback();
      await pool.query('UPDATE trade_quotes SET status="expired", executed_at=NOW() WHERE id=?', [quote_id]);
      return next({ status: 400, code: 'QUOTE_EXPIRED', message: 'Quote expired' });
    }

    const spentQuote = matchResult.spentQuote;
    const takerFee = matchResult.takerFee;
    if (spentQuote > amountWei) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }
    if (spentQuote <= 0n) {
      await conn.rollback();
      await pool.query('UPDATE trade_quotes SET status="failed", executed_at=NOW() WHERE id=?', [quote_id]);
      return next({ status: 400, code: 'INSUFFICIENT_LIQUIDITY', message: 'Unable to fill quote' });
    }
    if (balanceWei < spentQuote) {
      await conn.rollback();
      await pool.query('UPDATE trade_quotes SET status="failed", executed_at=NOW() WHERE id=?', [quote_id]);
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }

    await conn.query(
      'UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?',
      [spentQuote.toString(), userId, asset]
    );
    if (matchResult.receivedBase > 0n) {
      await conn.query(
        'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
        [userId, baseAsset, matchResult.receivedBase.toString()]
      );
    }

    await conn.query('UPDATE spot_orders SET remaining_base_wei=?, remaining_quote_wei=?, status=?, quote_amount_wei=? WHERE id=?', [
      taker.remainingBase.toString(),
      '0',
      taker.remainingBase <= 0n ? 'filled' : 'filled',
      spentQuote.toString(),
      orderId,
    ]);

    const netQuoteWithoutFee = spentQuote - takerFee > 0n ? spentQuote - takerFee : spentQuote;
    const executionPriceWei = matchResult.filledBase > 0n && netQuoteWithoutFee > 0n
      ? mulDiv(matchResult.filledBase, PRICE_SCALE, netQuoteWithoutFee)
      : 0n;

    await conn.query(
      'INSERT INTO trade_swaps (quote_id, user_id, asset, asset_decimals, target_decimals, asset_amount_wei, eltx_amount_wei, price_wei, gross_eltx_amount_wei, fee_asset, fee_amount_wei) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [
        quote_id,
        userId,
        asset,
        assetDecimals,
        targetDecimals,
        spentQuote.toString(),
        matchResult.receivedBase.toString(),
        executionPriceWei.toString(),
        matchResult.receivedBase.toString(),
        asset,
        takerFee.toString(),
      ]
    );
    await conn.query('UPDATE trade_quotes SET status="completed", executed_at=NOW() WHERE id=?', [quote_id]);
    await conn.commit();

    res.json({
      ok: true,
      swap: {
        quote_id,
        asset,
        amount: trimDecimal(formatUnitsStr(spentQuote.toString(), assetDecimals)),
        amount_wei: spentQuote.toString(),
        eltx_amount: trimDecimal(formatUnitsStr(matchResult.receivedBase.toString(), targetDecimals)),
        eltx_amount_wei: matchResult.receivedBase.toString(),
        rate: trimDecimal(formatUnitsStr(executionPriceWei.toString(), 18)),
        spread_bps: 0,
        fee_bps: Number(swapFeeBps),
        fee_asset: asset,
        fee_amount: trimDecimal(formatUnitsStr(takerFee.toString(), assetDecimals)),
        fee_amount_wei: takerFee.toString(),
      },
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/spot/markets', walletLimiter, async (req, res, next) => {
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
    const feeSettings = await readSpotFeeBps();
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
      fees: { maker_bps: feeSettings.maker, taker_bps: feeSettings.taker },
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/orderbook', walletLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const { market } = SpotOrderbookSchema.parse({ market: req.query.market });
    const marketRow = await getSpotMarket(pool, market);
    if (!marketRow || !marketRow.active)
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });

    const { orderbook, trades } = await readSpotOrderbookSnapshot(pool, marketRow);

    res.json({
      ok: true,
      market: {
        symbol: marketRow.symbol,
        base_asset: marketRow.base_asset,
        quote_asset: marketRow.quote_asset,
      },
      orderbook,
      trades,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/stream', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const { market } = SpotOrderbookSchema.parse({ market: req.query.market });
    const marketRow = await getSpotMarket(pool, market);
    if (!marketRow || !marketRow.active)
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    const send = (type, payload) => {
      if (closed) return;
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const pushSnapshot = async () => {
      try {
        const [snapshot, orders, balances, fees] = await Promise.all([
          readSpotOrderbookSnapshot(pool, marketRow),
          readSpotOrdersForUser(pool, userId, marketRow),
          readUserBalancesForAssets(pool, userId, [marketRow.base_asset, marketRow.quote_asset]),
          readSpotFeeBps(pool),
        ]);
        send('update', {
          market: {
            symbol: marketRow.symbol,
            base_asset: marketRow.base_asset,
            quote_asset: marketRow.quote_asset,
          },
          orderbook: snapshot.orderbook,
          trades: snapshot.trades,
          orders,
          balances,
          fees: { maker_bps: fees.maker, taker_bps: fees.taker },
        });
      } catch (err) {
        send('error', { message: err?.message || 'Stream error' });
      }
    };

    const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 15000);
    const interval = setInterval(pushSnapshot, 2000);
    pushSnapshot();

    req.on('close', () => {
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
      res.end();
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/candles', walletLimiter, async (req, res, next) => {
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
    const { candleFetchCap } = await readSpotRiskSettings();
    const fetchLimit = Math.min(maxPoints * 3, candleFetchCap);

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

app.get('/spot/orders', walletLimiter, async (req, res, next) => {
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

    const feeSettings = await readSpotFeeBps(conn);
    const riskSettings = await readSpotRiskSettings(conn);
    const makerFeeBps = clampBps(BigInt(feeSettings.maker || 0));
    const takerFeeBps = clampBps(BigInt(feeSettings.taker || 0));
    const topOfBook = await getSpotTopOfBook(conn, market.id, { forUpdate: true });

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
        const feeAmount = (quoteWithoutFee * makerFeeBps) / 10000n;
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

    if (type === 'market') {
      const bestReference = side === 'buy' ? topOfBook.ask : topOfBook.bid;
      if (!bestReference || bestReference <= 0n) {
        await conn.rollback();
        return next({ status: 400, code: 'NO_LIQUIDITY', message: 'Insufficient orderbook liquidity' });
      }
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
        Number(type === 'limit' ? makerFeeBps : takerFeeBps),
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
      feeBps: takerFeeBps,
    };

    const matchResult = await matchSpotOrder(conn, market, taker);

    if (type === 'market' && matchResult.filledBase > 0n) {
      const averagePriceWei = matchResult.averagePriceWei;
      const referencePrice = side === 'buy' ? topOfBook.ask : topOfBook.bid;
      if (!referencePrice || referencePrice <= 0n) {
        await conn.rollback();
        return next({ status: 400, code: 'NO_LIQUIDITY', message: 'Orderbook reference price missing' });
      }
      const slippageBps = computeRelativeBps(averagePriceWei, referencePrice);
      if (slippageBps > riskSettings.maxSlippageBps) {
        await conn.rollback();
        return next({ status: 400, code: 'SLIPPAGE_EXCEEDED', message: 'Order exceeds max slippage limit' });
      }
      const lastTradePrice = await getSpotLastTradePriceWei(conn, market.id);
      if (lastTradePrice && lastTradePrice > 0n) {
        const deviationBps = computeRelativeBps(averagePriceWei, lastTradePrice);
        if (deviationBps > riskSettings.maxDeviationBps) {
          await conn.rollback();
          return next({ status: 400, code: 'PRICE_DEVIATION_EXCEEDED', message: 'Order deviates from reference price' });
        }
      }
    }

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

async function settleStakingPositions({ positionId, asOfDate = new Date() } = {}) {
  const today = toDateOnlyString(asOfDate);
  const conn = await pool.getConnection();
  const results = [];
  try {
    await conn.beginTransaction();
    const params = [today];
    let idClause = '';
    if (positionId) {
      idClause = ' AND sp.id = ?';
      params.push(positionId);
    }

    const [rows] = await conn.query(
      `SELECT sp.id, sp.user_id, sp.plan_id, sp.amount_wei, sp.daily_reward, sp.accrued_total, sp.stake_asset, sp.stake_decimals,
              sp.status, sp.start_date, sp.end_date, sp.principal_redeemed,
              COALESCE(sa.last_accrual, DATE_SUB(sp.start_date, INTERVAL 1 DAY)) AS last_accrual
         FROM staking_positions sp
         LEFT JOIN (SELECT position_id, MAX(accrual_date) AS last_accrual FROM staking_accruals GROUP BY position_id) sa
           ON sa.position_id = sp.id
        WHERE sp.start_date <= ?
          AND (sp.status = 'active' OR (sp.status = 'matured' AND sp.principal_redeemed = 0))${idClause}
        FOR UPDATE`,
      params
    );

    for (const row of rows) {
      const asset = (row.stake_asset || 'ELTX').toUpperCase();
      const decimals = Number(row.stake_decimals || getSymbolDecimals(asset));
      const startDate = toDateOnlyString(row.start_date);
      const endDate = toDateOnlyString(row.end_date);
      const lastAccrual = toDateOnlyString(row.last_accrual) || addDays(startDate, -1);
      const firstPendingAccrual = addDays(lastAccrual, 1);
      const accrueUntil = today < endDate ? today : endDate;
      const accrualDates = [];
      if (firstPendingAccrual && accrueUntil && firstPendingAccrual <= accrueUntil) {
        let cursor = firstPendingAccrual;
        while (cursor && cursor <= accrueUntil) {
          accrualDates.push(cursor);
          cursor = addDays(cursor, 1);
        }
      }

      const dailyReward = new Decimal(row.daily_reward || 0);
      const rewardDecimal = dailyReward.mul(accrualDates.length);
      const rewardWeiStr = decimalToWeiString(rewardDecimal, decimals) || '0';
      const rewardWei = bigIntFromValue(rewardWeiStr);
      const rewardFormatted = formatDecimalValue(rewardDecimal, Math.min(decimals, 8));

      if (rewardWei > 0n) {
        for (const dateStr of accrualDates) {
          await conn.query('INSERT IGNORE INTO staking_accruals (position_id, accrual_date, amount) VALUES (?, ?, ?)', [
            row.id,
            dateStr,
            dailyReward.toFixed(Math.min(decimals, 18), Decimal.ROUND_DOWN),
          ]);
        }

        await conn.query(
          `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
          [row.user_id, asset, rewardWei.toString()]
        );
      }

      const shouldMature = today >= endDate;
      const principalWei = shouldMature && !row.principal_redeemed ? bigIntFromValue(row.amount_wei) : 0n;
      if (principalWei > 0n) {
        await conn.query(
          `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
          [row.user_id, asset, principalWei.toString()]
        );
      }

      const updates = [];
      const paramsUpdate = [];
      if (rewardDecimal.gt(0)) {
        updates.push('accrued_total = accrued_total + ?');
        paramsUpdate.push(rewardDecimal.toFixed(Math.min(decimals, 18), Decimal.ROUND_DOWN));
      }
      if (shouldMature && row.status !== 'matured') updates.push("status='matured'");
      if (principalWei > 0n && !updates.includes("status='matured'")) updates.push("status='matured'");
      if (principalWei > 0n) updates.push('principal_redeemed=1');
      if (updates.length) {
        paramsUpdate.push(row.id);
        await conn.query(`UPDATE staking_positions SET ${updates.join(', ')}, updated_at=NOW() WHERE id=?`, paramsUpdate);
      }

      results.push({
        id: row.id,
        user_id: row.user_id,
        asset,
        reward_days: accrualDates.length,
        reward_wei: rewardWei.toString(),
        reward: rewardFormatted,
        principal_wei: principalWei.toString(),
        principal: principalWei > 0n ? trimDecimal(formatUnitsStr(principalWei.toString(), decimals)) : '0',
        matured: shouldMature,
      });
    }

    await conn.commit();
    return results;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

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
              sp.accrued_total, sp.status, sp.principal_redeemed, pl.name
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
        principal_redeemed: !!row.principal_redeemed,
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
      'SELECT id, amount, amount_wei, accrued_total, end_date, status, principal_redeemed, stake_asset, stake_decimals FROM staking_positions WHERE id=? AND user_id=?',
      [id, userId]
    );
    if (!pos) return next({ status: 404, code: 'NOT_FOUND', message: 'Position not found' });
    if (pos.status === 'cancelled') return next({ status: 400, code: 'INVALID_STATE', message: 'Cancelled position' });
    const today = toDateOnlyString(new Date());
    const endDate = toDateOnlyString(pos.end_date);
    if (today < endDate) return next({ status: 400, code: 'TOO_SOON', message: 'Cannot close before maturity' });

    const summary = await settleStakingPositions({ positionId: id });
    const settlement = summary.find((s) => s.id === id);
    const decimals = Number(pos.stake_decimals || getSymbolDecimals(pos.stake_asset || 'ELTX'));
    const principal =
      settlement?.principal || trimDecimal(formatUnitsStr(pos.amount_wei?.toString() || '0', decimals));
    const reward =
      settlement?.reward ||
      formatDecimalValue(pos.accrued_total || 0, Math.min(decimals, 8));
    res.json({ ok: true, principal, reward, matured: true });
  } catch (err) {
    next(err);
  }
});

function toPlainIntegerString(value) {
  if (value === null || value === undefined) return '0';
  const str = value.toString();
  return str.includes('.') ? str.split('.')[0] : str;
}

function isTruthyFlag(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  const str = value.toString().toLowerCase();
  return str === '1' || str === 'true' || str === 'yes';
}

async function getStripePricing(conn = pool) {
  let row = null;
  try {
    const [rows] = await conn.query(
      'SELECT asset, price_eltx, min_amount, max_amount, updated_at FROM asset_prices WHERE UPPER(asset)=? LIMIT 1',
      ['USDC']
    );
    if (rows.length) row = rows[0];
  } catch (err) {
    console.warn('[stripe] failed to read asset_prices', err.message || err);
  }

  let price = null;
  if (row?.price_eltx !== undefined && row.price_eltx !== null) {
    try {
      const candidate = new Decimal(row.price_eltx);
      if (candidate.isFinite() && candidate.gt(0)) price = candidate;
    } catch {}
  }
  if (!price) {
    const base = Number.parseFloat(process.env.ELTX_PRICE_USD || '1');
    const normalizedBase = Number.isFinite(base) && base > 0 ? base : 1;
    try {
      price = new Decimal(1).div(normalizedBase);
    } catch {
      price = new Decimal(1);
    }
  }

  let min = new Decimal(
    Number.isFinite(stripeMinPurchaseUsd) && stripeMinPurchaseUsd > 0 ? stripeMinPurchaseUsd : 10
  );
  if (row?.min_amount !== undefined && row.min_amount !== null) {
    try {
      const dbMin = new Decimal(row.min_amount);
      if (dbMin.isFinite() && dbMin.gt(min)) min = dbMin;
    } catch {}
  }

  let max = null;
  if (Number.isFinite(stripeMaxPurchaseUsd) && stripeMaxPurchaseUsd > 0) {
    try {
      max = new Decimal(stripeMaxPurchaseUsd);
    } catch {}
  }
  if (row?.max_amount !== undefined && row.max_amount !== null) {
    try {
      const dbMax = new Decimal(row.max_amount);
      if (dbMax.isFinite() && dbMax.gt(0)) {
        max = max ? Decimal.min(max, dbMax) : dbMax;
      }
    } catch {}
  }

  return { asset: row?.asset || 'USDC', price, min, max, updatedAt: row?.updated_at || null };
}

function formatFiatPurchaseRow(row) {
  const usdMinorRaw = row.usd_amount_minor !== undefined && row.usd_amount_minor !== null ? row.usd_amount_minor : 0;
  const usdMinor = Number(usdMinorRaw);
  return {
    id: row.id,
    status: row.status,
    usd_amount: row.usd_amount?.toString() || '0',
    usd_amount_minor: Number.isFinite(usdMinor) ? usdMinor : 0,
    price_eltx: row.price_eltx?.toString() || '0',
    eltx_amount: row.eltx_amount?.toString() || '0',
    eltx_amount_wei: toPlainIntegerString(row.eltx_amount_wei),
    credited: isTruthyFlag(row.credited),
    stripe_payment_intent_id: row.stripe_payment_intent_id || null,
    stripe_session_id: row.stripe_session_id || null,
    amount_charged_minor:
      row.amount_charged_minor !== undefined && row.amount_charged_minor !== null
        ? Number(row.amount_charged_minor)
        : null,
    created_at: row.created_at,
    completed_at: row.completed_at || null,
    credited_at: row.credited_at || null,
  };
}

async function creditFiatPurchase(conn, purchase, refs = {}) {
  const alreadyCredited = isTruthyFlag(purchase.credited);
  if (alreadyCredited) {
    if (refs.paymentIntentId) {
      await conn.query(
        'UPDATE fiat_purchases SET stripe_payment_intent_id=COALESCE(?, stripe_payment_intent_id) WHERE id=?',
        [refs.paymentIntentId, purchase.id]
      );
    }
    return;
  }

  const eltxWei = BigInt(toPlainIntegerString(purchase.eltx_amount_wei));
  if (eltxWei <= 0n) {
    await conn.query('UPDATE fiat_purchases SET credited=1, credited_at=NOW() WHERE id=?', [purchase.id]);
    return;
  }

  await conn.query(
    `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
    [purchase.user_id, ELTX_SYMBOL, eltxWei.toString()]
  );

  const txHash = refs.paymentIntentId
    ? `stripe:${refs.paymentIntentId}`
    : refs.sessionId
    ? `stripe_session:${refs.sessionId}`
    : `stripe:${purchase.id}`;

  const [depositRes] = await conn.query(
    `INSERT INTO wallet_deposits (
        user_id, chain_id, address, token_symbol, tx_hash, log_index, block_number, block_hash,
        token_address, amount_wei, confirmations, status, credited, source, created_at, last_update_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, 'confirmed', 1, 'stripe', NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       id=LAST_INSERT_ID(id),
       status='confirmed',
       credited=1,
       amount_wei=VALUES(amount_wei),
       source='stripe',
       last_update_at=NOW()`,
    [purchase.user_id, 0, 'stripe', ELTX_SYMBOL, txHash, 'stripe', ZERO_ADDRESS, eltxWei.toString()]
  );
  const depositId = depositRes.insertId;

  await conn.query(
    'UPDATE fiat_purchases SET credited=1, credited_at=NOW(), wallet_deposit_id=COALESCE(wallet_deposit_id, ?) WHERE id=?',
    [depositId, purchase.id]
  );
}

async function handleStripeCheckoutCompleted(session) {
  const metadata = session.metadata || {};
  const purchaseId = metadata.purchaseId ? Number(metadata.purchaseId) : null;
  if (!purchaseId) {
    console.warn('[stripe] checkout completed without purchaseId metadata');
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[purchase]] = await conn.query('SELECT * FROM fiat_purchases WHERE id=? FOR UPDATE', [purchaseId]);
    if (!purchase) {
      await conn.rollback();
      console.warn('[stripe] purchase not found for checkout session', purchaseId);
      return;
    }

    const paymentIntentId = session.payment_intent ? String(session.payment_intent) : null;
    const amountTotal =
      session.amount_total !== undefined && session.amount_total !== null ? Number(session.amount_total) : null;
    const currency = (session.currency || purchase.currency || 'USD').toUpperCase();

    await conn.query(
      `UPDATE fiat_purchases
         SET status='succeeded',
             stripe_payment_intent_id=COALESCE(?, stripe_payment_intent_id),
             amount_charged_minor=COALESCE(?, amount_charged_minor),
             currency=?,
             stripe_session_id=COALESCE(?, stripe_session_id),
             completed_at=NOW(),
             updated_at=NOW()
       WHERE id=?`,
      [paymentIntentId, amountTotal, currency, session.id, purchaseId]
    );

    purchase.credited = isTruthyFlag(purchase.credited);
    await creditFiatPurchase(conn, purchase, { paymentIntentId, sessionId: session.id });
    await conn.commit();
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

async function markStripeSessionStatus(session, status) {
  const metadata = session.metadata || {};
  const purchaseId = metadata.purchaseId ? Number(metadata.purchaseId) : null;
  try {
    if (purchaseId) {
      await pool.query(
        "UPDATE fiat_purchases SET status=?, updated_at=NOW() WHERE id=? AND status IN ('pending','failed')",
        [status, purchaseId]
      );
    } else if (session.id) {
      await pool.query(
        "UPDATE fiat_purchases SET status=?, updated_at=NOW() WHERE stripe_session_id=? AND status IN ('pending','failed')",
        [status, session.id]
      );
    }
  } catch (err) {
    console.error('[stripe] failed to update session status', err);
  }
}

async function handleStripePaymentFailed(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const purchaseId = metadata.purchaseId ? Number(metadata.purchaseId) : null;
  if (!purchaseId) return;
  try {
    const failureCode = paymentIntent.last_payment_error?.code || paymentIntent.status || null;
    const failureMessage = paymentIntent.last_payment_error?.message || null;
    await pool.query(
      "UPDATE fiat_purchases SET status='failed', failure_code=?, failure_message=?, stripe_payment_intent_id=COALESCE(?, stripe_payment_intent_id), updated_at=NOW() WHERE id=? AND status IN ('pending','failed')",
      [failureCode, failureMessage, paymentIntent.id, purchaseId]
    );
  } catch (err) {
    console.error('[stripe] failed to mark purchase failed', err);
  }
}

async function handleStripeRefund(charge) {
  const paymentIntentId = charge.payment_intent ? String(charge.payment_intent) : null;
  if (!paymentIntentId) return;
  try {
    await pool.query(
      "UPDATE fiat_purchases SET status='refunded', failure_code='refunded', failure_message=NULL, updated_at=NOW() WHERE stripe_payment_intent_id=?",
      [paymentIntentId]
    );
  } catch (err) {
    console.error('[stripe] failed to mark purchase refunded', err);
  }
}

async function runStakingSweep() {
  try {
    const summary = await settleStakingPositions();
    if (summary.length) {
      const matured = summary.filter((s) => s.matured).length;
      console.log(`[staking] settled ${summary.length} positions (matured ${matured})`);
    }
  } catch (err) {
    console.error('[staking] sweep failed', err?.message || err);
  }
}

setTimeout(runStakingSweep, 5_000);
setInterval(runStakingSweep, STAKING_SWEEP_INTERVAL_MS);

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

