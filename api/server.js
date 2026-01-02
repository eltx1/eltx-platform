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
const http = require('http');
const path = require('path');
const { z } = require('zod');
const { ethers } = require('ethers');
const Decimal = require('decimal.js');
const Stripe = require('stripe');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;
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
const STRIPE_PRICING_ASSET = 'USD';

const DEFAULT_SPOT_MAX_SLIPPAGE_BPS = 300n;
const DEFAULT_SPOT_MAX_DEVIATION_BPS = 800n;
const DEFAULT_SPOT_CANDLE_FETCH_LIMIT = 3000;
const WITHDRAWAL_CHAINS = ['Ethereum', 'BNB', 'Solana', 'Base'];
const DEFAULT_MARKET_MAKER_SPREAD_BPS = 200;
const DEFAULT_MARKET_MAKER_REFRESH_MINUTES = 30;
const DEFAULT_MARKET_MAKER_TARGET_BASE_PCT = 50;

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
  return `${normalized}/wallet`;
}

function buildDefaultCancelUrl(base) {
  const normalized = normalizeBaseUrl(base) || STRIPE_BASE_FALLBACK;
  return `${normalized}/wallet`;
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
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
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
app.use(express.json({ limit: '15mb' }));
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
          try {
            await originalConnQuery(sql);
          } catch (err) {
            const code = err && err.code;
            if (code === 'ER_CANT_DROP_FIELD_OR_KEY' || code === 'ER_DUP_KEYNAME') {
              console.warn('schema adjust skip', err.sqlMessage || err.message || err);
              continue;
            }
            throw err;
          }
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

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const ADMIN_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'asid';
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN || (IS_PROD ? '.eltx.online' : undefined);
const USER_SESSION_TTL_SECONDS = Math.max(300, Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7));
const sessionCookie = {
  httpOnly: true,
  sameSite: IS_PROD ? 'none' : 'lax',
  secure: IS_PROD,
  domain: COOKIE_DOMAIN,
  path: '/',
  maxAge: USER_SESSION_TTL_SECONDS * 1000,
};

const ADMIN_SESSION_TTL_SECONDS = Math.max(60, Number(process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 24));
const adminSessionCookie = {
  httpOnly: true,
  sameSite: IS_PROD ? 'strict' : 'lax',
  secure: IS_PROD,
  domain: COOKIE_DOMAIN,
  path: '/',
  maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
};

function parseCookies(header = '') {
  return header.split(';').reduce((acc, pair) => {
    const [rawKey, ...rest] = pair.split('=');
    if (!rawKey || !rest.length) return acc;
    const key = rawKey.trim();
    if (!key) return acc;
    const value = rest.join('=').trim();
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
}

const rateLimitJsonHandler = (req, res) =>
  res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } });

const sessionRateLimitKey = (req) => {
  const sessionId = req.cookies?.[COOKIE_NAME];
  if (sessionId) return sessionId;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded.length && forwarded[0].trim()) return forwarded[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const createSessionLimiter = (options) =>
  rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitJsonHandler,
    keyGenerator: sessionRateLimitKey,
  });

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler,
});

const walletLimiter = createSessionLimiter({
  windowMs: 60 * 1000,
  max: 60,
});

const supportLimiter = createSessionLimiter({
  windowMs: 60 * 1000,
  max: 20,
});

const spotLimiter = createSessionLimiter({
  windowMs: 60 * 1000,
  max: 300,
});

async function fetchAssetLogos(symbols) {
  if (!symbols.length) return new Map();
  try {
    const logoKeys = symbols.map((sym) => `asset_logo_${sym.toLowerCase()}_url`);
    if (!logoKeys.length) return new Map();
    const [rows] = await pool.query('SELECT name, value FROM platform_settings WHERE name IN (?)', [logoKeys]);
    const map = new Map();
    for (const row of rows) {
      if (!row?.name || !row?.value) continue;
      const match = row.name.match(/^asset_logo_(.+)_url$/);
      if (!match || !match[1]) continue;
      const symbol = match[1].toUpperCase();
      if (symbols.includes(symbol)) map.set(symbol, row.value);
    }
    return map;
  } catch (err) {
    console.warn('asset-logo-lookup-failed', err?.code || err?.message || err);
    return new Map();
  }
}

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  language: z.string().trim().optional(),
  referral_code: z.string().trim().max(32).optional(),
});

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
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

const EmailSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  from_address: z.string().trim().email().or(z.literal('')).optional(),
  admin_recipients: z.union([z.string(), z.array(z.string().email())]).optional(),
  user_welcome_enabled: z.boolean().optional(),
  user_kyc_enabled: z.boolean().optional(),
  admin_kyc_enabled: z.boolean().optional(),
  user_p2p_enabled: z.boolean().optional(),
  admin_p2p_enabled: z.boolean().optional(),
  user_withdrawal_enabled: z.boolean().optional(),
  admin_withdrawal_enabled: z.boolean().optional(),
  user_support_enabled: z.boolean().optional(),
  admin_support_enabled: z.boolean().optional(),
});

const EmailAnnouncementSchema = z.object({
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(3).max(5000),
  subject_ar: z.string().trim().max(150).optional(),
  message_ar: z.string().trim().max(5000).optional(),
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

function normalizeUsernameFromEmail(email) {
  const [local] = email.split('@');
  const cleaned = (local || 'user').toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user';
  return cleaned.slice(0, 48);
}

async function generateUsernameFromEmail(conn, email) {
  const base = normalizeUsernameFromEmail(email);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${crypto.randomInt(0, 10_000).toString().padStart(4, '0')}`;
    const candidate = `${base}${suffix}`.slice(0, 64);
    const [[existing]] = await conn.query('SELECT 1 FROM users WHERE username=? LIMIT 1', [candidate]);
    if (!existing) return candidate;
  }
  return `${base}_${crypto.randomUUID().slice(0, 8)}`.slice(0, 64);
}

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

const AdminKycQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const AdminKycDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().max(500).optional(),
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

const MarketMakerSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    spread_bps: z.coerce.number().int().min(0).max(5000).optional(),
    refresh_minutes: z.coerce.number().int().min(1).max(1440).optional(),
    user_email: z.string().email().optional(),
    pairs: z.union([z.string(), z.array(z.string().min(3))]).optional(),
    target_base_pct: z.coerce.number().min(1).max(99).optional(),
  })
  .refine(
    (data) =>
      data.enabled !== undefined ||
      data.spread_bps !== undefined ||
      data.refresh_minutes !== undefined ||
      data.user_email !== undefined ||
      data.pairs !== undefined ||
      data.target_base_pct !== undefined,
    { message: 'At least one market maker field must be provided' }
  );

const AdminFeeUpdateSchema = z
  .object({
    swap_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    spot_trade_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    spot_maker_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    spot_taker_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    transfer_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
    withdrawal_fee_bps: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (data) =>
      data.swap_fee_bps !== undefined ||
      data.spot_trade_fee_bps !== undefined ||
      data.spot_maker_fee_bps !== undefined ||
      data.spot_taker_fee_bps !== undefined ||
      data.transfer_fee_bps !== undefined ||
      data.withdrawal_fee_bps !== undefined,
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
    allow_market_orders: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
  });

const AdminStripePricingUpdateSchema = z
  .object({
    price_eltx: z.string().optional(),
    price_usdt: z.string().optional(),
    min_usd: z.string().optional(),
    max_usd: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No update fields provided',
  });

const P2P_SUPPORTED_ASSETS = ['USDC', 'USDT'];

const P2POfferCreateSchema = z.object({
  side: z.enum(['buy', 'sell']),
  asset: z.enum(['USDC', 'USDT']),
  currency: z.string().min(1).max(8).default('USD'),
  price: z.string(),
  min_limit: z.string(),
  max_limit: z.string(),
  total_amount: z.string(),
  payment_method_ids: z.array(z.number().int().positive()).min(1),
});

const P2POffersQuerySchema = z.object({
  side: z.enum(['buy', 'sell']).optional(),
  asset: z.enum(['USDC', 'USDT']).optional(),
  amount: z.string().optional(),
  payment_method_id: z.coerce.number().int().positive().optional(),
});

const P2POfferIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
const P2PTradeCreateSchema = z.object({
  offer_id: z.number().int().positive(),
  amount: z.string(),
  payment_method_id: z.number().int().positive(),
});

const P2PMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

const P2PDisputeSchema = z.object({
  reason: z.string().min(3).max(255),
  evidence: z.string().max(4000).optional(),
});

const P2PPaymentMethodSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().max(64).optional(),
  country: z.string().max(64).optional(),
  dispute_delay_hours: z.number().int().min(0).max(24 * 30).default(0),
  is_active: z.boolean().optional(),
});

const P2PPaymentMethodUpdateSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    code: z.string().max(64).optional(),
    country: z.string().max(64).optional(),
    dispute_delay_hours: z.number().int().min(0).max(24 * 30).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No update fields provided' });

const P2PDisputeResolveSchema = z.object({
  resolution: z.enum(['buyer', 'seller', 'cancel']),
});

const CHAIN_ID = Number(process.env.CHAIN_ID || 56);
const SUPPORTED_CHAINS = [56, 1];
const DEFAULT_CHAIN_BY_SYMBOL = { BNB: 56, ETH: 1, WBTC: 56, ELTX: CHAIN_ID };

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

function formatWithdrawalRow(row) {
  const decimals = Number(row.asset_decimals || getSymbolDecimals(row.asset || ELTX_SYMBOL));
  const amountWei = row.amount_wei?.toString() || '0';
  const amountWeiBig = bigIntFromValue(amountWei);
  const feeBps = Number(row.fee_bps ?? 0);
  const feeWeiBig = bigIntFromValue(row.fee_wei ?? 0);
  const netWeiBig = row.net_amount_wei !== undefined && row.net_amount_wei !== null ? bigIntFromValue(row.net_amount_wei) : amountWeiBig - feeWeiBig;
  const safeNetWei = netWeiBig >= 0n ? netWeiBig : 0n;
  const safeFeeWei = feeWeiBig >= 0n ? feeWeiBig : 0n;
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;
  const handledAt = row.handled_at instanceof Date ? row.handled_at.toISOString() : row.handled_at;
  return {
    id: row.id,
    user_id: row.user_id,
    asset: row.asset || ELTX_SYMBOL,
    asset_decimals: decimals,
    amount_wei: amountWei,
    amount_formatted: trimDecimal(formatUnitsStr(amountWeiBig.toString(), decimals)),
    fee_bps: feeBps,
    fee_wei: safeFeeWei.toString(),
    fee_formatted: trimDecimal(formatUnitsStr(safeFeeWei.toString(), decimals)),
    net_amount_wei: safeNetWei.toString(),
    net_amount_formatted: trimDecimal(formatUnitsStr(safeNetWei.toString(), decimals)),
    chain: row.chain,
    address: row.address,
    reason: row.reason || null,
    status: row.status,
    reject_reason: row.reject_reason || null,
    handled_by_admin_id: row.handled_by_admin_id ?? null,
    handled_at: handledAt || null,
    created_at: createdAt,
    updated_at: updatedAt,
    user_email: row.user_email || null,
    user_username: row.user_username || null,
  };
}

const DEFAULT_ELTX_DECIMALS = 18;
const ELTX_DECIMALS = (() => {
  const raw = Number(process.env.TOKEN_ELTX_DECIMALS);
  return normalizeDecimals(raw, DEFAULT_ELTX_DECIMALS);
})();
const ELTX_SYMBOL = 'ELTX';
const STRIPE_SUPPORTED_ASSETS = [ELTX_SYMBOL, 'USDT'];
const WITHDRAWAL_ASSETS = [ELTX_SYMBOL, 'USDT'];
const DEFAULT_WITHDRAWAL_FEE_BPS = 1000;
const AI_DAILY_FREE_SETTING = 'ai_daily_free_messages';
const AI_PRICE_SETTING = 'ai_message_price_eltx';
const DEFAULT_AI_DAILY_FREE = 10;
const DEFAULT_AI_PRICE = '1';
const REFERRAL_REWARD_SETTING = 'referral_reward_eltx';
const DEFAULT_REFERRAL_REWARD = '0';
const WITHDRAWAL_STATUS = ['pending', 'completed', 'rejected'];
const SUPPORT_STATUSES = ['open', 'answered', 'closed'];

function getSymbolDecimals(symbol) {
  const meta = tokenMetaBySymbol[symbol];
  if (meta && meta.decimals !== undefined && meta.decimals !== null)
    return normalizeDecimals(meta.decimals, DEFAULT_ELTX_DECIMALS);
  if (symbol === ELTX_SYMBOL) return ELTX_DECIMALS;
  if (symbol?.toUpperCase() === 'USDT' || symbol?.toUpperCase() === 'USDC') return 6;
  return DEFAULT_ELTX_DECIMALS;
}

function normalizeDecimals(value, fallback = DEFAULT_ELTX_DECIMALS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 36) return fallback;
  return Math.floor(parsed);
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

function parseDecimalValue(value) {
  try {
    const decimalValue = new Decimal(value);
    if (!decimalValue.isFinite() || decimalValue.isNegative()) return null;
    return decimalValue;
  } catch {
    return null;
  }
}

async function getLatestFundingTimestamp(conn, userId) {
  const [[fiatRow]] = await conn.query(
    "SELECT MAX(COALESCE(completed_at, created_at)) AS last_fiat FROM fiat_purchases WHERE user_id=? AND status='succeeded'",
    [userId]
  );
  const [[depositRow]] = await conn.query(
    "SELECT MAX(created_at) AS last_deposit FROM wallet_deposits WHERE user_id=? AND status IN ('confirmed','swept')",
    [userId]
  );
  const fiatDate = fiatRow?.last_fiat ? new Date(fiatRow.last_fiat) : null;
  const depositDate = depositRow?.last_deposit ? new Date(depositRow.last_deposit) : null;
  if (fiatDate && depositDate) return fiatDate > depositDate ? fiatDate : depositDate;
  return fiatDate || depositDate || null;
}

function addHours(date, hours) {
  try {
    const next = new Date(date);
    next.setHours(next.getHours() + hours);
    return next;
  } catch {
    return null;
  }
}

async function ensureSellerEligibility(conn, userId) {
  const lastFunding = await getLatestFundingTimestamp(conn, userId);
  if (!lastFunding) {
    return { eligible: false, availableAt: null };
  }
  const eligibleAt = addHours(lastFunding, 24 * 7);
  if (!eligibleAt) return { eligible: false, availableAt: null };
  return { eligible: Date.now() >= eligibleAt.getTime(), availableAt: eligibleAt };
}

function publicUsername(username, userId) {
  const fallback = userId ? `user-${userId}` : 'user';
  if (!username) return fallback;
  const trimmed = String(username).trim();
  if (!trimmed) return fallback;
  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0];
    return local || fallback;
  }
  return trimmed;
}

function presentPaymentMethodRow(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    country: row.country,
    is_active: !!row.is_active,
    dispute_delay_hours: Number(row.dispute_delay_hours || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function presentOfferRow(row, paymentMethods = []) {
  return {
    id: row.id,
    user: { id: row.user_id, username: publicUsername(row.username, row.user_id) },
    side: row.side,
    asset: row.asset,
    currency: row.currency || 'USD',
    price: formatDecimalValue(row.price, 6),
    min_limit: formatDecimalValue(row.min_limit, 2),
    max_limit: formatDecimalValue(row.max_limit, 2),
    total_amount: trimDecimal(row.total_amount),
    available_amount: trimDecimal(row.available_amount),
    status: row.status,
    payment_methods: paymentMethods,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function presentTradeRow(row) {
  return {
    id: row.id,
    offer_id: row.offer_id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    buyer_username: publicUsername(row.buyer_username, row.buyer_id),
    seller_username: publicUsername(row.seller_username, row.seller_id),
    payment_method_id: row.payment_method_id,
    payment_method_name: row.payment_method_name,
    asset: row.asset,
    currency: row.currency || 'USD',
    price: formatDecimalValue(row.price, 6),
    amount: trimDecimal(row.amount),
    fiat_amount: formatDecimalValue(row.fiat_amount, 2),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    paid_at: row.paid_at,
    released_at: row.released_at,
    completed_at: row.completed_at,
    disputed_at: row.disputed_at,
  };
}

async function getP2PTradeEmailContext(tradeId) {
  const [[row]] = await pool.query(
    `SELECT t.*, pm.name AS payment_method_name,
            bu.username AS buyer_username, bu.email AS buyer_email, bu.language AS buyer_language,
            su.username AS seller_username, su.email AS seller_email, su.language AS seller_language
       FROM p2p_trades t
       JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
       JOIN users bu ON bu.id=t.buyer_id
       JOIN users su ON su.id=t.seller_id
      WHERE t.id=?`,
    [tradeId]
  );
  if (!row) return null;
  const amount = trimDecimal(row.amount);
  const fiat = formatDecimalValue(row.fiat_amount, 2);
  const buyerUsername = publicUsername(row.buyer_username, row.buyer_id);
  const sellerUsername = publicUsername(row.seller_username, row.seller_id);
  return {
    tradeId: row.id,
    status: row.status,
    currency: row.currency || 'USD',
    asset: row.asset,
    amount,
    fiat,
    payment: row.payment_method_name,
    buyer: { email: row.buyer_email, username: buyerUsername, language: row.buyer_language || 'en' },
    seller: { email: row.seller_email, username: sellerUsername, language: row.seller_language || 'en' },
  };
}

function enqueueP2PStatusEmails(context, status, note) {
  if (!context) return;
  const statusLabels = {
    payment_pending: { en: 'awaiting payment', ar: 'منتظر الدفع' },
    paid: { en: 'payment marked', ar: 'تم تأكيد الدفع' },
    released: { en: 'released to buyer', ar: 'تم الإفراج للمشتري' },
    completed: { en: 'completed', ar: 'مكتمل' },
    disputed: { en: 'in dispute', ar: 'تحت النزاع' },
  };
  const label = statusLabels[status] || { en: status, ar: status };
  const common = {
    tradeId: context.tradeId,
    amount: `${context.amount} ${context.asset}`,
    fiat: `${context.fiat} ${context.currency || 'USD'}`,
    payment: context.payment,
    status: label.en,
    note,
  };
  enqueueEmail({
    kind: 'user-p2p-status',
    to: context.buyer.email,
    language: context.buyer.language || 'en',
    data: {
      ...common,
      status: (label[(context.buyer.language || 'en') === 'ar' ? 'ar' : 'en']) || label.en,
      role: 'buyer',
      counterparty: context.seller.username,
    },
  });
  enqueueEmail({
    kind: 'user-p2p-status',
    to: context.seller.email,
    language: context.seller.language || 'en',
    data: {
      ...common,
      status: (label[(context.seller.language || 'en') === 'ar' ? 'ar' : 'en']) || label.en,
      role: 'seller',
      counterparty: context.buyer.username,
    },
  });
}

function enqueueAdminP2PEmail(context, status, note) {
  if (!context) return;
  enqueueEmail({
    kind: 'admin-p2p-trade',
    data: {
      tradeId: context.tradeId,
      status,
      asset: context.asset,
      amount: `${context.amount} ${context.asset}`,
      fiat: `${context.fiat} ${context.currency || 'USD'}`,
      payment: context.payment,
      buyer: context.buyer.username,
      seller: context.seller.username,
      note,
    },
  });
}

function shrinkAddress(address) {
  if (!address) return 'N/A';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function getWithdrawalStatusLabel(status, lang = 'en') {
  const labels = {
    pending: { en: 'pending review', ar: 'قيد المراجعة' },
    approved: { en: 'approved', ar: 'تمت الموافقة' },
    completed: { en: 'completed', ar: 'تم التنفيذ' },
    rejected: { en: 'rejected', ar: 'مرفوض' },
  };
  const fallback = { en: status || 'updated', ar: status || 'محدّث' };
  const label = labels[status] || fallback;
  return (lang === 'ar' ? label.ar : label.en) || fallback.en;
}

function enqueueWithdrawalEmails(event, withdrawal, userContact) {
  if (!withdrawal) return;
  const lang = userContact?.language || 'en';
  const statusLabel = getWithdrawalStatusLabel(withdrawal.status, lang);
  const assetSymbol = withdrawal.asset || ELTX_SYMBOL;
  const netAmount = withdrawal.net_amount_formatted || withdrawal.amount_formatted || withdrawal.amount_wei;
  const grossAmount = withdrawal.amount_formatted || withdrawal.amount_wei;
  const feeAmount = withdrawal.fee_formatted || withdrawal.fee_wei || null;
  const amountLabel = `${netAmount} ${assetSymbol}`;
  const grossLabel = `${grossAmount} ${assetSymbol}`;
  const feeLabel = feeAmount ? `${feeAmount} ${assetSymbol}` : null;
  const destination = shrinkAddress(withdrawal.address);
  const chain = withdrawal.chain || '—';
  const reason = withdrawal.reason || null;
  const rejection = withdrawal.reject_reason || null;

  if (userContact?.email) {
    const baseData = {
      amount: amountLabel,
      chain,
      destination,
      grossAmount: grossLabel,
      fee: feeLabel,
      reason,
      status: statusLabel,
      rejection: rejection || null,
    };
    const kind = event === 'created' ? 'user-withdrawal-created' : 'user-withdrawal-updated';
    enqueueEmail({
      kind,
      to: userContact.email,
      language: lang,
      data: { ...baseData, username: userContact.username },
    });
  }

  enqueueEmail({
    kind: event === 'created' ? 'admin-withdrawal-created' : 'admin-withdrawal-updated',
    data: {
      amount: amountLabel,
      chain,
      destination,
      reason,
      status: getWithdrawalStatusLabel(withdrawal.status, 'en'),
      rejection: rejection || null,
      userEmail: userContact?.email,
      userUsername: userContact?.username,
      requestId: withdrawal.id,
    },
  });
}

function enqueueSupportEmails(kind, payload) {
  if (!payload) return;
  if (kind === 'user-created' && payload.user?.email) {
    enqueueEmail({
      kind: 'user-support-created',
      to: payload.user.email,
      language: payload.user.language || 'en',
      data: {
        ticketId: payload.ticketId,
        title: payload.title,
        message: payload.message,
        username: payload.user.username,
      },
    });
  }

  if (kind === 'admin-created') {
    enqueueEmail({
      kind: 'admin-support-created',
      data: {
        ticketId: payload.ticketId,
        title: payload.title,
        message: payload.message,
        userEmail: payload.user?.email,
        userUsername: payload.user?.username,
      },
    });
  }

  if (kind === 'user-replied') {
    const sender = payload.user?.username || payload.user?.email || 'user';
    if (payload.user?.email) {
      enqueueEmail({
        kind: 'user-support-reply',
        to: payload.user.email,
        language: payload.user.language || 'en',
        data: {
          ticketId: payload.ticketId,
          title: payload.title,
          message: payload.message,
          username: payload.user.username,
        },
      });
    }
    enqueueEmail({
      kind: 'admin-support-reply',
      data: {
        ticketId: payload.ticketId,
        title: payload.title,
        message: payload.message,
        userEmail: payload.user?.email,
        userUsername: payload.user?.username,
        sender,
      },
    });
  }

  if (kind === 'admin-replied' && payload.user?.email) {
    const sender = payload.adminUsername || 'admin';
    enqueueEmail({
      kind: 'user-support-reply',
      to: payload.user.email,
      language: payload.user.language || 'en',
      data: {
        ticketId: payload.ticketId,
        title: payload.title,
        message: payload.message,
        username: payload.user.username,
      },
    });
    enqueueEmail({
      kind: 'admin-support-reply',
      data: {
        ticketId: payload.ticketId,
        title: payload.title,
        message: payload.message,
        userEmail: payload.user?.email,
        userUsername: payload.user?.username,
        sender,
      },
    });
  }
}

function presentAdminRow(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

function parseBase64File(file) {
  const base64 = file?.base64 || '';
  const cleaned = base64.includes(',') ? base64.split(',').pop() : base64;
  let buffer = Buffer.from(cleaned || '', 'base64');
  if (!buffer.length) throw { status: 400, code: 'BAD_INPUT', message: 'Invalid document file' };
  if (buffer.byteLength > MAX_KYC_FILE_BYTES)
    throw {
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: `Document must be smaller than ${Math.round(MAX_KYC_FILE_BYTES / (1024 * 1024))}MB`,
    };
  return { buffer, name: file.name, mime: file.type || 'application/octet-stream' };
}

function presentKycRow(row, { includeDocument = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    username: row.username,
    language: row.language,
    status: row.status,
    full_name: row.full_name,
    country: row.country,
    document_type: row.document_type,
    document_number: row.document_number,
    document_filename: row.document_filename,
    document_mime: row.document_mime,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewer_username: row.reviewer_username,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    document_base64: includeDocument && row.document_data ? row.document_data.toString('base64') : undefined,
  };
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

function parseBooleanSetting(value, fallback = false) {
  const normalized = normalizeSettingValue(value);
  if (normalized === null) return fallback;
  const lower = normalized.toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(lower)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(lower)) return false;
  return fallback;
}

function escapeHtml(value) {
  return (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseEmailList(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.split(/[\n,]/);
  return list
    .map((item) => item.trim())
    .filter((item) => item && /@/.test(item))
    .slice(0, 20);
}

function generateReferralCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function ensureReferralCode(conn, userId) {
  const executor = conn.query ? conn : pool;
  const [rows] = await executor.query('SELECT code FROM referral_codes WHERE user_id=?', [userId]);
  if (rows.length) return rows[0].code;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateReferralCode();
    try {
      await executor.query('INSERT INTO referral_codes (user_id, code) VALUES (?, ?)', [userId, code]);
      return code;
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') continue;
      throw err;
    }
  }
  throw new Error('Failed to allocate referral code');
}

function parseTicketId(raw) {
  const numeric = Number.parseInt((raw || '').toString(), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function presentSupportTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    status: row.status,
    last_message_at: row.last_message_at || row.updated_at || row.created_at,
    last_sender: row.last_sender || null,
    closed_at: row.closed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    message_count: Number(row.message_count || row.messages_count || 0),
    last_message_preview: row.last_message_preview || null,
  };
}

function presentSupportMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticket_id: row.ticket_id,
    sender_type: row.sender_type,
    user_id: row.user_id ?? null,
    admin_id: row.admin_id ?? null,
    admin_username: row.admin_username || null,
    user_username: row.user_username || null,
    message: row.message,
    created_at: row.created_at,
  };
}

async function getUserContact(userId, conn = pool) {
  const executor = conn.query ? conn : pool;
  const [[row]] = await executor.query('SELECT email, username, language FROM users WHERE id=? LIMIT 1', [userId]);
  if (!row) return null;
  return { email: row.email, username: row.username, language: row.language || 'en' };
}

async function readReferralSettings(conn = pool) {
  const reward = await getPlatformSettingValue(REFERRAL_REWARD_SETTING, DEFAULT_REFERRAL_REWARD, conn);
  return { reward_eltx: trimDecimal(reward) };
}

const EMAIL_SETTING_KEYS = {
  enabled: 'email_enabled',
  from: 'email_from_address',
  adminRecipients: 'email_admin_recipients',
  userWelcome: 'email_user_welcome_enabled',
  userKyc: 'email_user_kyc_enabled',
  adminKyc: 'email_admin_kyc_enabled',
  userP2P: 'email_user_p2p_enabled',
  adminP2P: 'email_admin_p2p_enabled',
  userWithdrawal: 'email_user_withdrawal_enabled',
  adminWithdrawal: 'email_admin_withdrawal_enabled',
  userSupport: 'email_user_support_enabled',
  adminSupport: 'email_admin_support_enabled',
};

const EMAIL_SETTINGS_CACHE_MS = 60 * 1000;
let cachedEmailSettings = null;
let cachedEmailLoadedAt = 0;
let cachedTransporter = null;
let cachedTransportSignature = '';
const emailQueue = [];
const emailLowPriorityQueue = [];
let emailQueueActive = false;
let emailLowPriorityActive = false;
const LOW_PRIORITY_EMAIL_DELAY_MS = 750;

function getSmtpStatus() {
  const host = normalizeSettingValue(process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = normalizeSettingValue(process.env.SMTP_USER);
  const pass = normalizeSettingValue(process.env.SMTP_PASS);
  const from = normalizeSettingValue(process.env.SMTP_FROM) || user || null;
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((key) => !process.env[key]);
  return { host, port, user, pass, from, missing, ready: missing.length === 0 };
}

function buildTransporter(status) {
  if (!status.ready) return null;
  const signature = `${status.host}:${status.port}:${status.user}`;
  if (cachedTransporter && cachedTransportSignature === signature) return cachedTransporter;
  cachedTransportSignature = signature;
  cachedTransporter = nodemailer.createTransport({
    host: status.host,
    port: status.port,
    secure: status.port === 465,
    auth: { user: status.user, pass: status.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return cachedTransporter;
}

async function readEmailSettings(conn = pool, { forceReload = false } = {}) {
  const useCache = conn === pool && !forceReload && cachedEmailSettings && Date.now() - cachedEmailLoadedAt < EMAIL_SETTINGS_CACHE_MS;
  if (useCache) return cachedEmailSettings;

  const enabled = parseBooleanSetting(await getPlatformSettingValue(EMAIL_SETTING_KEYS.enabled, '0', conn));
  const fromSetting = normalizeSettingValue(await getPlatformSettingValue(EMAIL_SETTING_KEYS.from, '', conn));
  const adminList = parseEmailList(await getPlatformSettingValue(EMAIL_SETTING_KEYS.adminRecipients, '', conn));
  const userWelcomeEnabled = parseBooleanSetting(
    await getPlatformSettingValue(EMAIL_SETTING_KEYS.userWelcome, '1', conn),
    true
  );
  const userKycEnabled = parseBooleanSetting(await getPlatformSettingValue(EMAIL_SETTING_KEYS.userKyc, '1', conn), true);
  const adminKycEnabled = parseBooleanSetting(await getPlatformSettingValue(EMAIL_SETTING_KEYS.adminKyc, '1', conn), true);
  const userP2pEnabled = parseBooleanSetting(await getPlatformSettingValue(EMAIL_SETTING_KEYS.userP2P, '1', conn), true);
  const adminP2pEnabled = parseBooleanSetting(await getPlatformSettingValue(EMAIL_SETTING_KEYS.adminP2P, '1', conn), true);
  const userWithdrawalEnabled = parseBooleanSetting(
    await getPlatformSettingValue(EMAIL_SETTING_KEYS.userWithdrawal, '1', conn),
    true
  );
  const adminWithdrawalEnabled = parseBooleanSetting(
    await getPlatformSettingValue(EMAIL_SETTING_KEYS.adminWithdrawal, '1', conn),
    true
  );
  const userSupportEnabled = parseBooleanSetting(
    await getPlatformSettingValue(EMAIL_SETTING_KEYS.userSupport, '1', conn),
    true
  );
  const adminSupportEnabled = parseBooleanSetting(
    await getPlatformSettingValue(EMAIL_SETTING_KEYS.adminSupport, '1', conn),
    true
  );

  const settings = {
    enabled,
    from: fromSetting || '',
    adminRecipients: adminList,
    userWelcomeEnabled,
    userKycEnabled,
    adminKycEnabled,
    userP2pEnabled,
    adminP2pEnabled,
    userWithdrawalEnabled,
    adminWithdrawalEnabled,
    userSupportEnabled,
    adminSupportEnabled,
  };

  if (conn === pool) {
    cachedEmailSettings = settings;
    cachedEmailLoadedAt = Date.now();
  }
  return settings;
}

function invalidateEmailSettingsCache() {
  cachedEmailLoadedAt = 0;
  cachedEmailSettings = null;
}

function presentEmailSettings(settings) {
  return {
    enabled: !!settings.enabled,
    from_address: settings.from || '',
    admin_recipients: settings.adminRecipients || [],
    user_welcome_enabled: !!settings.userWelcomeEnabled,
    user_kyc_enabled: !!settings.userKycEnabled,
    admin_kyc_enabled: !!settings.adminKycEnabled,
    user_p2p_enabled: !!settings.userP2pEnabled,
    admin_p2p_enabled: !!settings.adminP2pEnabled,
    user_withdrawal_enabled: !!settings.userWithdrawalEnabled,
    admin_withdrawal_enabled: !!settings.adminWithdrawalEnabled,
    user_support_enabled: !!settings.userSupportEnabled,
    admin_support_enabled: !!settings.adminSupportEnabled,
  };
}

const PLATFORM_URL = 'https://eltx.online';

function wrapEmailHtml(title, bodyLines, lang = 'en') {
  const direction = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  const body = (bodyLines || [])
    .map(
      (line) =>
        `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#e2e8f0;text-align:${align};">${escapeHtml(line)}</p>`
    )
    .join('');
  return `<div dir="${direction}" style="font-family:Inter,Arial,sans-serif;background:#0b1221;padding:16px;color:#e2e8f0;">` +
    `<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,0.35);">` +
    `<h2 style="margin:0 0 12px 0;color:#93c5fd;font-size:18px;text-align:${align};">${escapeHtml(title)}</h2>` +
    body +
    `<p style="margin:12px 0 0 0;text-align:${align};"><a href="${PLATFORM_URL}" style="color:#60a5fa;text-decoration:none;font-weight:600;" target="_blank" rel="noreferrer">ELTX</a></p>` +
    `</div><p style="color:#94a3b8;font-size:12px;margin:12px 0 0;text-align:${align};">ELTX Platform · <a href="${PLATFORM_URL}" style="color:#60a5fa;text-decoration:none;" target="_blank" rel="noreferrer">${PLATFORM_URL}</a></p></div>`;
}

const EMAIL_TEMPLATE_BUILDERS = {
  welcome: {
    en: (data) => {
      const username = data?.username || 'there';
      const lines = [
        `Hi ${username}, welcome to ELTX!`,
        'Your account is live. You can switch between English and Arabic at any time from your settings.',
        'If this wasn’t you, please contact support immediately.',
      ];
      return { subject: 'Welcome to ELTX', body: lines };
    },
    ar: (data) => {
      const username = data?.username || 'صديقنا';
      const lines = [
        `اهلا يا ${username}، حسابك اتفعل على ELTX`,
        'تقدر تبدل بين العربي والإنجليزي في أي وقت من الإعدادات.',
        'لو الطلب دا مش ليك، كلّم الدعم فوراً.',
      ];
      return { subject: 'اهلا بيك في ELTX', body: lines };
    },
  },
  'user-kyc-submitted': {
    en: (data) => {
      const lines = [
        'We received your KYC submission and the team is reviewing it now.',
        'You will get an email once a decision is made.',
      ];
      return { subject: 'We received your KYC request', body: lines };
    },
    ar: () => {
      const lines = [
        'استلمنا طلب التحقق بتاعك وفريقنا بيراجعه حالياً.',
        'هنبعتلك ايميل أول ما يتم اتخاذ القرار.',
      ];
      return { subject: 'تم استلام مستندات التحقق', body: lines };
    },
  },
  'user-kyc-approved': {
    en: () => {
      const lines = [
        'Good news! Your KYC verification is approved.',
        'You can continue using all features without interruption.',
      ];
      return { subject: 'Your KYC is approved', body: lines };
    },
    ar: () => {
      const lines = ['تمت الموافقة على التحقق بتاعك.', 'تقدر تكمل استخدام كل المزايا بدون أي توقف.'];
      return { subject: 'تمت الموافقة على KYC', body: lines };
    },
  },
  'user-kyc-rejected': {
    en: (data) => {
      const reason = data?.reason ? `Reason: ${data.reason}` : 'Reason: Missing or invalid details.';
      const lines = [
        'We reviewed your KYC request but could not approve it this time.',
        reason,
        'You can resubmit your documents from the dashboard.',
      ];
      return { subject: 'Your KYC needs an update', body: lines };
    },
    ar: (data) => {
      const reason = data?.reason ? `السبب: ${data.reason}` : 'السبب: بيانات ناقصة أو غير واضحة.';
      const lines = ['راجعنا طلب التحقق لكن محتاج تعديل.', reason, 'تقدر تعيد الإرسال من الداشبورد.'];
      return { subject: 'مطلوب تحديث مستندات التحقق', body: lines };
    },
  },
  'admin-kyc-submitted': {
    en: (data) => {
      const details = [
        `User ID: ${data?.userId ?? 'unknown'}`,
        data?.email ? `Email: ${data.email}` : null,
        data?.username ? `Username: ${data.username}` : null,
        data?.fullName ? `Name: ${data.fullName}` : null,
        data?.country ? `Country: ${data.country}` : null,
      ].filter(Boolean);
      const lines = ['A new KYC submission is waiting for review.', ...details];
      return { subject: 'New KYC submission', body: lines };
    },
  },
  'user-p2p-status': {
    en: (data) => {
      const status = data?.status || 'updated';
      const role = data?.role || 'trader';
      const lines = [
        `Trade #${data?.tradeId ?? '—'} is now ${status}.`,
        `You are the ${role}. Counterparty: ${data?.counterparty || 'N/A'}.`,
        data?.amount ? `Amount: ${data.amount}` : null,
        data?.fiat ? `Fiat: ${data.fiat}` : null,
        data?.payment ? `Payment method: ${data.payment}` : null,
        data?.note || null,
      ].filter(Boolean);
      return { subject: `P2P trade ${status}`, body: lines };
    },
    ar: (data) => {
      const status = data?.status || 'محدّث';
      const role = data?.role === 'buyer' ? 'المشتري' : data?.role === 'seller' ? 'البائع' : 'المستخدم';
      const lines = [
        `الطلب رقم ${data?.tradeId ?? '—'} حالته بقت ${status}.`,
        `دورك: ${role}. الطرف التاني: ${data?.counterparty || 'غير معروف'}.`,
        data?.amount ? `الكمية: ${data.amount}` : null,
        data?.fiat ? `القيمة: ${data.fiat}` : null,
        data?.payment ? `طريقة الدفع: ${data.payment}` : null,
        data?.note || null,
      ].filter(Boolean);
      return { subject: `تحديث طلب P2P - ${status}`, body: lines };
    },
  },
  'admin-p2p-trade': {
    en: (data) => {
      const lines = [
        `Trade #${data?.tradeId ?? '—'} ${data?.status ? `is ${data.status}` : 'was updated'}.`,
        data?.asset ? `Asset: ${data.asset}` : null,
        data?.amount ? `Amount: ${data.amount}` : null,
        data?.fiat ? `Fiat: ${data.fiat}` : null,
        data?.payment ? `Payment method: ${data.payment}` : null,
        data?.buyer ? `Buyer: ${data.buyer}` : null,
        data?.seller ? `Seller: ${data.seller}` : null,
        data?.note || null,
      ].filter(Boolean);
      return { subject: 'P2P trade update', body: lines };
    },
  },
  'user-withdrawal-created': {
    en: (data) => {
      const lines = [
        'We received your withdrawal request and it is being reviewed by the team.',
        data?.amount ? `Amount: ${data.amount}` : null,
        data?.chain ? `Chain: ${data.chain}` : null,
        data?.destination ? `Destination: ${data.destination}` : null,
        data?.reason ? `Reason: ${data.reason}` : null,
        'You will get an email when the status changes.',
      ].filter(Boolean);
      return { subject: 'Withdrawal request received', body: lines };
    },
    ar: (data) => {
      const lines = [
        'استلمنا طلب السحب وجاري مراجعته من الفريق.',
        data?.amount ? `القيمة: ${data.amount}` : null,
        data?.chain ? `الشبكة: ${data.chain}` : null,
        data?.destination ? `العنوان: ${data.destination}` : null,
        data?.reason ? `السبب: ${data.reason}` : null,
        'هنبعتلك ايميل أول ما الحالة تتغير.',
      ].filter(Boolean);
      return { subject: 'تم استلام طلب السحب', body: lines };
    },
  },
  'user-withdrawal-updated': {
    en: (data) => {
      const lines = [
        `Your withdrawal status is now ${data?.status || 'updated'}.`,
        data?.amount ? `Amount: ${data.amount}` : null,
        data?.chain ? `Chain: ${data.chain}` : null,
        data?.destination ? `Destination: ${data.destination}` : null,
        data?.rejection ? `Reason: ${data.rejection}` : null,
      ].filter(Boolean);
      return { subject: 'Withdrawal status changed', body: lines };
    },
    ar: (data) => {
      const lines = [
        `حالة السحب بقت ${data?.status || 'محدّثة'}.`,
        data?.amount ? `القيمة: ${data.amount}` : null,
        data?.chain ? `الشبكة: ${data.chain}` : null,
        data?.destination ? `العنوان: ${data.destination}` : null,
        data?.rejection ? `السبب: ${data.rejection}` : null,
      ].filter(Boolean);
      return { subject: 'تم تحديث حالة السحب', body: lines };
    },
  },
  'admin-withdrawal-created': {
    en: (data) => {
      const lines = [
        `New withdrawal request #${data?.requestId ?? '—'}.`,
        data?.userUsername || data?.userEmail ? `User: ${data.userUsername || data.userEmail} (${data.userEmail || 'N/A'})` : null,
        data?.amount ? `Amount: ${data.amount}` : null,
        data?.chain ? `Chain: ${data.chain}` : null,
        data?.destination ? `Destination: ${data.destination}` : null,
        data?.reason ? `Reason: ${data.reason}` : null,
        data?.status ? `Status: ${data.status}` : null,
      ].filter(Boolean);
      return { subject: 'Admin alert: withdrawal request', body: lines };
    },
  },
  'admin-withdrawal-updated': {
    en: (data) => {
      const lines = [
        `Withdrawal #${data?.requestId ?? '—'} status changed.`,
        data?.userUsername || data?.userEmail ? `User: ${data.userUsername || data.userEmail} (${data.userEmail || 'N/A'})` : null,
        data?.amount ? `Amount: ${data.amount}` : null,
        data?.chain ? `Chain: ${data.chain}` : null,
        data?.destination ? `Destination: ${data.destination}` : null,
        data?.reason ? `Reason: ${data.reason}` : null,
        data?.rejection ? `Rejection: ${data.rejection}` : null,
        data?.status ? `Status: ${data.status}` : null,
      ].filter(Boolean);
      return { subject: 'Withdrawal updated', body: lines };
    },
  },
  'user-support-created': {
    en: (data) => {
      const lines = [
        `We got your support ticket #${data?.ticketId ?? '—'}.`,
        data?.title ? `Title: ${data.title}` : null,
        data?.message ? `Message: ${data.message}` : null,
        'We will get back to you soon via email and your dashboard.',
      ].filter(Boolean);
      return { subject: 'Support ticket received', body: lines };
    },
    ar: (data) => {
      const lines = [
        `استلمنا تذكرتك رقم ${data?.ticketId ?? '—'}.`,
        data?.title ? `العنوان: ${data.title}` : null,
        data?.message ? `الرسالة: ${data.message}` : null,
        'هنرد عليك بأسرع وقت على الايميل والداشبورد.',
      ].filter(Boolean);
      return { subject: 'تم استلام تذكرتك', body: lines };
    },
  },
  'user-support-reply': {
    en: (data) => {
      const lines = [
        `New reply on ticket #${data?.ticketId ?? '—'}.`,
        data?.title ? `Title: ${data.title}` : null,
        data?.message ? `Message: ${data.message}` : null,
      ].filter(Boolean);
      return { subject: 'Support ticket update', body: lines };
    },
    ar: (data) => {
      const lines = [
        `رد جديد على التذكرة رقم ${data?.ticketId ?? '—'}.`,
        data?.title ? `العنوان: ${data.title}` : null,
        data?.message ? `الرسالة: ${data.message}` : null,
      ].filter(Boolean);
      return { subject: 'تحديث على التذكرة', body: lines };
    },
  },
  'admin-support-created': {
    en: (data) => {
      const lines = [
        `New support ticket #${data?.ticketId ?? '—'}.`,
        data?.userUsername || data?.userEmail ? `User: ${data.userUsername || data.userEmail} (${data.userEmail || 'N/A'})` : null,
        data?.title ? `Title: ${data.title}` : null,
        data?.message ? `Message: ${data.message}` : null,
      ].filter(Boolean);
      return { subject: 'Admin alert: support ticket', body: lines };
    },
  },
  'admin-support-reply': {
    en: (data) => {
      const sender = data?.sender || 'user';
      const lines = [
        `Reply on ticket #${data?.ticketId ?? '—'} from ${sender}.`,
        data?.userUsername || data?.userEmail ? `User: ${data.userUsername || data.userEmail} (${data.userEmail || 'N/A'})` : null,
        data?.title ? `Title: ${data.title}` : null,
        data?.message ? `Message: ${data.message}` : null,
      ].filter(Boolean);
      return { subject: 'Support reply alert', body: lines };
    },
  },
};

function renderEmailTemplate(kind, language, data) {
  const template = EMAIL_TEMPLATE_BUILDERS[kind];
  if (!template) return null;
  const lang = language === 'ar' ? 'ar' : 'en';
  const builder = template[lang] || template.en;
  if (!builder) return null;
  const { subject, body } = builder(data || {});
  const lines = [...(body || [])];
  const platformLine = lang === 'ar' ? `زور المنصة: ${PLATFORM_URL}` : `Visit ELTX online: ${PLATFORM_URL}`;
  lines.push(platformLine);
  return { subject, text: lines.join('\n'), html: wrapEmailHtml(subject, lines, lang) };
}

const EMAIL_JOB_CONFIG = {
  welcome: {
    shouldSend: (settings) => settings.userWelcomeEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'user-kyc-submitted': {
    shouldSend: (settings) => settings.userKycEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'user-kyc-approved': {
    shouldSend: (settings) => settings.userKycEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'user-kyc-rejected': {
    shouldSend: (settings) => settings.userKycEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'admin-kyc-submitted': {
    shouldSend: (settings) => settings.adminKycEnabled && settings.adminRecipients.length > 0,
    recipients: (_, settings) => settings.adminRecipients,
  },
  'user-p2p-status': {
    shouldSend: (settings) => settings.userP2pEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'admin-p2p-trade': {
    shouldSend: (settings) => settings.adminP2pEnabled && settings.adminRecipients.length > 0,
    recipients: (_, settings) => settings.adminRecipients,
  },
  'user-withdrawal-created': {
    shouldSend: (settings) => settings.userWithdrawalEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'user-withdrawal-updated': {
    shouldSend: (settings) => settings.userWithdrawalEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'admin-withdrawal-created': {
    shouldSend: (settings) => settings.adminWithdrawalEnabled && settings.adminRecipients.length > 0,
    recipients: (_, settings) => settings.adminRecipients,
  },
  'admin-withdrawal-updated': {
    shouldSend: (settings) => settings.adminWithdrawalEnabled && settings.adminRecipients.length > 0,
    recipients: (_, settings) => settings.adminRecipients,
  },
  'user-support-created': {
    shouldSend: (settings) => settings.userSupportEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'user-support-reply': {
    shouldSend: (settings) => settings.userSupportEnabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
  'admin-support-created': {
    shouldSend: (settings) => settings.adminSupportEnabled && settings.adminRecipients.length > 0,
    recipients: (_, settings) => settings.adminRecipients,
  },
  'admin-support-reply': {
    shouldSend: (settings) => settings.adminSupportEnabled && settings.adminRecipients.length > 0,
    recipients: (_, settings) => settings.adminRecipients,
  },
  announcement: {
    shouldSend: (settings) => settings.enabled,
    recipients: (job) => (job.to ? [job.to] : []),
  },
};

function buildCustomEmailTemplate(subject, message, language = 'en') {
  const normalizedSubject = normalizeSettingValue(subject);
  const bodyLines = (message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!normalizedSubject || !bodyLines.length) return null;
  const lang = language === 'ar' ? 'ar' : 'en';
  return {
    subject: normalizedSubject,
    text: bodyLines.join('\n'),
    html: wrapEmailHtml(normalizedSubject, bodyLines, lang),
  };
}

async function handleEmailJob(job) {
  const settings = await readEmailSettings();
  if (!settings.enabled) return;
  const config = EMAIL_JOB_CONFIG[job.kind];
  if (!config || !config.shouldSend(settings)) return;
  const recipients = (config.recipients(job, settings) || []).filter(Boolean);
  if (!recipients.length) return;

  const smtpStatus = getSmtpStatus();
  if (!smtpStatus.ready) {
    console.warn(`[email] skipped ${job.kind}: missing SMTP config (${smtpStatus.missing.join(', ') || 'unknown'})`);
    return;
  }

  const template =
    job.kind === 'announcement'
      ? job.data?.template || null
      : renderEmailTemplate(job.kind, job.language || 'en', job.data || {});
  if (!template) return;

  const transporter = buildTransporter(smtpStatus);
  if (!transporter) return;

  const from = settings.from || smtpStatus.from || smtpStatus.user || 'no-reply@localhost';
  for (const to of recipients) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
        headers: {
          'X-Request-Id': job.requestId || undefined,
          'X-ELTX-Notification': job.kind,
        },
      });
    } catch (err) {
      console.error(`[email] failed to send ${job.kind} to ${to}`, err?.message || err);
    }
  }
}

async function processEmailQueue() {
  if (emailQueueActive) return;
  emailQueueActive = true;
  while (emailQueue.length) {
    const next = emailQueue.shift();
    try {
      await handleEmailJob(next);
    } catch (err) {
      console.error('[email] unexpected error', err?.message || err);
    }
  }
  emailQueueActive = false;
}

function enqueueEmail(job) {
  emailQueue.push(job);
  if (!emailQueueActive) {
    setImmediate(() => {
      processEmailQueue();
    });
  }
}

async function processLowPriorityQueue() {
  if (emailLowPriorityActive) return;
  emailLowPriorityActive = true;
  while (emailLowPriorityQueue.length) {
    const next = emailLowPriorityQueue.shift();
    try {
      await handleEmailJob(next);
    } catch (err) {
      console.error('[email] unexpected error', err?.message || err);
    }
    if (LOW_PRIORITY_EMAIL_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, LOW_PRIORITY_EMAIL_DELAY_MS));
    }
  }
  emailLowPriorityActive = false;
}

function enqueueLowPriorityEmail(job) {
  emailLowPriorityQueue.push(job);
  if (!emailLowPriorityActive) {
    setImmediate(() => {
      processLowPriorityQueue();
    });
  }
}

async function queueAnnouncementEmails(payload, requestId, initiatedBy) {
  const templates = {
    en: buildCustomEmailTemplate(payload.subject, payload.message, 'en'),
    ar: buildCustomEmailTemplate(
      payload.subject_ar || payload.subject,
      payload.message_ar || payload.message,
      'ar'
    ),
  };

  if (!templates.en) {
    throw { status: 400, code: 'BAD_INPUT', message: 'Subject and message are required' };
  }

  const batchSize = 500;
  let lastId = 0;
  let queued = 0;
  // walk users in ascending ID order to avoid heavy OFFSET scans
  while (true) {
    const [rows] = await pool.query(
      'SELECT id, email, language FROM users WHERE email IS NOT NULL AND email != "" AND id > ? ORDER BY id ASC LIMIT ?',
      [lastId, batchSize]
    );
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      if (!row.email) continue;
      const language = row.language === 'ar' ? 'ar' : 'en';
      const template = language === 'ar' && templates.ar ? templates.ar : templates.en;
      if (!template) continue;
      enqueueLowPriorityEmail({
        kind: 'announcement',
        to: row.email,
        language,
        data: { template, initiatedBy: initiatedBy || undefined },
        requestId,
      });
      queued += 1;
    }
    if (rows.length < batchSize) break;
  }
  return queued;
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
  const withdrawalVal = await getPlatformSettingValue('withdrawal_fee_bps', DEFAULT_WITHDRAWAL_FEE_BPS.toString(), conn);
  const swapFeeBps = clampBps(BigInt(Number.parseInt(swapVal, 10) || 0));
  const spotMakerFeeBps = clampBps(BigInt(Number.parseInt(makerVal, 10) || 0));
  const spotTakerFeeBps = clampBps(BigInt(Number.parseInt(takerVal, 10) || 0));
  const transferFeeBps = clampBps(BigInt(Number.parseInt(transferVal, 10) || 0));
  const withdrawalFeeBps = clampBps(BigInt(Number.parseInt(withdrawalVal, 10) || 0));
  return {
    swap_fee_bps: Number(swapFeeBps),
    spot_trade_fee_bps: Number(spotTakerFeeBps),
    spot_maker_fee_bps: Number(spotMakerFeeBps),
    spot_taker_fee_bps: Number(spotTakerFeeBps),
    transfer_fee_bps: Number(transferFeeBps),
    withdrawal_fee_bps: Number(withdrawalFeeBps),
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
  const sql = `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount, price_precision, amount_precision, active, allow_market_orders FROM spot_markets WHERE symbol=?${
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

async function estimateSpotMarketFill(conn, market, { side, baseAmountWei }) {
  const result = { filledBase: 0n, totalQuote: 0n, averagePriceWei: 0n };
  const [rows] = await conn.query(
    `SELECT price_wei, remaining_base_wei
       FROM spot_orders
      WHERE market_id=? AND side=? AND status='open'
      ORDER BY ${side === 'buy' ? 'price_wei ASC, id ASC' : 'price_wei DESC, id ASC'}
      LIMIT 200`,
    [market.id, side === 'buy' ? 'sell' : 'buy']
  );

  let remainingBase = baseAmountWei;
  for (const row of rows) {
    if (remainingBase <= 0n) break;
    const levelBase = bigIntFromValue(row.remaining_base_wei);
    const priceWei = BigInt(row.price_wei || 0);
    if (levelBase <= 0n || priceWei <= 0n) continue;

    const tradeBase = remainingBase < levelBase ? remainingBase : levelBase;
    const quoteWithoutFee = computeQuoteAmount(tradeBase, priceWei);
    if (tradeBase <= 0n || quoteWithoutFee <= 0n) continue;

    result.filledBase += tradeBase;
    result.totalQuote += quoteWithoutFee;
    remainingBase -= tradeBase;
  }

  if (result.filledBase > 0n) {
    result.averagePriceWei = mulDiv(result.totalQuote, PRICE_SCALE, result.filledBase);
  }

  return result;
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

async function readMarketMakerSettings(conn = pool) {
  const enabledRaw = await getPlatformSettingValue('market_maker_enabled', '0', conn);
  const spreadRaw = await getPlatformSettingValue(
    'market_maker_spread_bps',
    DEFAULT_MARKET_MAKER_SPREAD_BPS.toString(),
    conn
  );
  const refreshRaw = await getPlatformSettingValue(
    'market_maker_refresh_minutes',
    DEFAULT_MARKET_MAKER_REFRESH_MINUTES.toString(),
    conn
  );
  const userEmail = await getPlatformSettingValue('market_maker_user_email', '', conn);
  const pairsRaw = await getPlatformSettingValue('market_maker_pairs', '', conn);
  const targetPctRaw = await getPlatformSettingValue(
    'market_maker_target_base_pct',
    DEFAULT_MARKET_MAKER_TARGET_BASE_PCT.toString(),
    conn
  );

  const spread = Number.parseInt(spreadRaw, 10);
  const refreshMinutes = Number.parseInt(refreshRaw, 10);
  const targetPct = Number.parseInt(targetPctRaw, 10);
  return {
    enabled: enabledRaw === '1' || enabledRaw?.toLowerCase?.() === 'true',
    spread_bps: Number.isFinite(spread) ? spread : DEFAULT_MARKET_MAKER_SPREAD_BPS,
    refresh_minutes: Number.isFinite(refreshMinutes) ? refreshMinutes : DEFAULT_MARKET_MAKER_REFRESH_MINUTES,
    user_email: userEmail || '',
    pairs: pairsRaw
      ? pairsRaw
          .split(',')
          .map((p) => p.trim().toUpperCase())
          .filter(Boolean)
      : [],
    target_base_pct: Number.isFinite(targetPct) ? targetPct : DEFAULT_MARKET_MAKER_TARGET_BASE_PCT,
  };
}

async function updateMarketMakerSettings(partial) {
  const tasks = [];
  if (partial.enabled !== undefined) tasks.push(setPlatformSettingValue('market_maker_enabled', partial.enabled ? '1' : '0'));
  if (partial.spread_bps !== undefined) tasks.push(setPlatformSettingValue('market_maker_spread_bps', partial.spread_bps.toString()));
  if (partial.refresh_minutes !== undefined)
    tasks.push(setPlatformSettingValue('market_maker_refresh_minutes', partial.refresh_minutes.toString()));
  if (partial.user_email !== undefined) tasks.push(setPlatformSettingValue('market_maker_user_email', partial.user_email));
  if (partial.pairs !== undefined)
    tasks.push(setPlatformSettingValue('market_maker_pairs', partial.pairs.map((p) => p.trim().toUpperCase()).join(',')));
  if (partial.target_base_pct !== undefined)
    tasks.push(setPlatformSettingValue('market_maker_target_base_pct', partial.target_base_pct.toString()));
  if (!tasks.length) return;
  await Promise.all(tasks);
}

async function readSpotOrderbookVersion(conn, marketRow) {
  const [rows] = await conn.query(
    `SELECT UNIX_TIMESTAMP(updated_at) * 1000 AS updated_ms, id
       FROM spot_orders
       WHERE market_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
    [marketRow.id]
  );
  if (!rows.length) return { ts: 0, id: 0 };
  return { ts: Number(rows[0].updated_ms) || 0, id: Number(rows[0].id) || 0 };
}

function formatSpotTrade(row, marketRow) {
  return {
    id: row.id,
    price: trimDecimal(formatUnitsStr(row.price_wei.toString(), 18)),
    price_wei: row.price_wei?.toString() || '0',
    base_amount: trimDecimal(formatUnitsStr(row.base_amount_wei.toString(), marketRow.base_decimals)),
    base_amount_wei: row.base_amount_wei?.toString() || '0',
    quote_amount: trimDecimal(formatUnitsStr(row.quote_amount_wei.toString(), marketRow.quote_decimals)),
    quote_amount_wei: row.quote_amount_wei?.toString() || '0',
    taker_side: row.taker_side,
    created_at: row.created_at,
  };
}

function formatSpotOrderDelta(row, marketRow) {
  const priceWei = BigInt(row.price_wei || 0);
  const remainingBaseWei = bigIntFromValue(row.remaining_base_wei);
  const remainingQuoteWei = bigIntFromValue(row.remaining_quote_wei);
  const createdAt = new Date(row.created_at);
  const updatedAt = new Date(row.updated_at);
  const isInsert = createdAt.getTime() === updatedAt.getTime();
  const action = row.status === 'open' ? (isInsert ? 'insert' : 'update') : 'cancel';

  return {
    id: row.id,
    side: row.side,
    status: row.status,
    action,
    price: priceWei > 0n ? trimDecimal(formatUnitsStr(priceWei.toString(), 18)) : null,
    price_wei: priceWei.toString(),
    remaining_base_amount: trimDecimal(formatUnitsStr(remainingBaseWei.toString(), marketRow.base_decimals)),
    remaining_base_wei: remainingBaseWei.toString(),
    remaining_quote_amount: trimDecimal(formatUnitsStr(remainingQuoteWei.toString(), marketRow.quote_decimals)),
    remaining_quote_wei: remainingQuoteWei.toString(),
    updated_at: row.updated_at,
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
  const trades = tradeRows.map((row) => formatSpotTrade(row, marketRow));
  const orderbookVersion = await readSpotOrderbookVersion(conn, marketRow);
  const lastTradeId = trades.length ? trades[0].id : 0;

  return {
    orderbookVersion,
    lastTradeId,
    orderbook: { bids: bidRows.map(formatLevel), asks: askRows.map(formatLevel) },
    trades,
  };
}

async function readSpotOrderbookDeltas(conn, marketRow, sinceVersion) {
  const sinceTs = Number(sinceVersion?.ts || 0);
  const sinceId = Number(sinceVersion?.id || 0);
  const [rows] = await conn.query(
    `SELECT id, side, price_wei, remaining_base_wei, remaining_quote_wei, status, created_at, updated_at
       FROM spot_orders
       WHERE market_id=?
         AND (
           updated_at > FROM_UNIXTIME(? / 1000)
           OR (updated_at = FROM_UNIXTIME(? / 1000) AND id > ?)
         )
       ORDER BY updated_at ASC, id ASC
       LIMIT 200`,
    [marketRow.id, sinceTs, sinceTs, sinceId]
  );
  const deltas = rows.map((row) => formatSpotOrderDelta(row, marketRow));
  let version = sinceVersion || { ts: 0, id: 0 };
  if (rows.length) {
    const lastRow = rows[rows.length - 1];
    version = { ts: new Date(lastRow.updated_at).getTime(), id: lastRow.id };
  } else {
    version = await readSpotOrderbookVersion(conn, marketRow);
  }
  return { deltas, version };
}

async function readSpotTradeDeltas(conn, marketRow, lastTradeId = 0) {
  const [rows] = await conn.query(
    `SELECT id, price_wei, base_amount_wei, quote_amount_wei, taker_side, created_at
       FROM spot_trades
       WHERE market_id=? AND id > ?
       ORDER BY id ASC
       LIMIT 50`,
    [marketRow.id, lastTradeId]
  );
  const trades = rows.map((row) => formatSpotTrade(row, marketRow));
  const maxId = trades.length ? trades[trades.length - 1].id : lastTradeId;
  return { trades, lastTradeId: maxId };
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
  asset: z.enum(['BNB', 'ETH', 'USDC', 'USDT', 'WBTC', 'ELTX']),
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
  time_in_force: z.preprocess(
    (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    z.enum(['gtc', 'ioc', 'fok']).default('gtc')
  ),
});

const SpotOrderbookSchema = z.object({
  market: z.string().min(3).max(32),
});

const SpotDeltaSchema = z.object({
  market: z.string().min(3).max(32),
  last_trade_id: z.coerce.number().int().nonnegative().default(0),
  orderbook_version_ts: z.coerce.number().nonnegative().default(0),
  orderbook_version_id: z.coerce.number().int().nonnegative().default(0),
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
  expected_price_asset: z.string().optional(),
  asset: z.string().optional(),
});

const MAX_KYC_FILE_BYTES = 8 * 1024 * 1024; // 8MB

const KycSubmissionSchema = z.object({
  full_name: z.string().min(3).max(200),
  country: z.string().min(2).max(120),
  document_type: z.string().min(2).max(120),
  document_number: z.string().min(3).max(120),
  agreement: z.literal(true, { errorMap: () => ({ message: 'You must accept the KYC & AML policy' }) }),
  document_file: z.object({
    name: z.string().min(1).max(255),
    type: z.string().min(1).max(120),
    base64: z.string().min(20),
  }),
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

const ReferralSettingsSchema = z.object({
  reward_eltx: z.union([z.string(), z.number()]),
});

const SupportTicketCreateSchema = z.object({
  title: z.string().trim().min(4).max(150),
  message: z.string().trim().min(10).max(4000),
});

const SupportReplySchema = z.object({
  message: z.string().trim().min(2).max(4000),
});

const SupportStatusUpdateSchema = z.object({
  status: z.enum(['open', 'answered', 'closed']),
});

const CANDLE_INTERVALS = {
  '5m': { seconds: 300 },
  '1h': { seconds: 3600 },
  '1d': { seconds: 86400 },
};

const WithdrawalCreateSchema = z.object({
  amount: z.string().min(1),
  asset: z.enum(WITHDRAWAL_ASSETS),
  chain: z.enum(WITHDRAWAL_CHAINS),
  address: z.string().min(8).max(191),
  reason: z.string().trim().max(255).optional().nullable(),
});

const AdminWithdrawalUpdateSchema = z.object({
  status: z.enum(['completed', 'rejected']),
  reason: z.string().trim().max(255).optional().nullable(),
});

async function requireUser(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) throw { status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' };
  const [rows] = await pool.query(
    'SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > NOW()',
    [token]
  );
  if (!rows.length) throw { status: 401, code: 'UNAUTHENTICATED', message: 'Not authenticated' };
  await pool.query('UPDATE sessions SET expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?', [
    USER_SESSION_TTL_SECONDS,
    token,
  ]);
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
    const assetParam = (req.query?.asset || ELTX_SYMBOL).toString();
    const assetRaw = assetParam ? assetParam.toUpperCase() : ELTX_SYMBOL;
    const asset = STRIPE_SUPPORTED_ASSETS.includes(assetRaw) ? assetRaw : ELTX_SYMBOL;
    const pricing = await getStripePricing(pool, asset);
    const min = pricing.min.toFixed(2, Decimal.ROUND_UP);
    const max = pricing.max ? pricing.max.toFixed(2, Decimal.ROUND_DOWN) : null;
    const prices = STRIPE_SUPPORTED_ASSETS.map((sym) => {
      const price = pricing.prices?.[sym];
      return {
        asset: sym,
        price_asset: price ? price.toFixed(18, Decimal.ROUND_DOWN) : null,
        price_eltx: price ? price.toFixed(18, Decimal.ROUND_DOWN) : null,
        decimals: getSymbolDecimals(sym),
        updated_at: pricing.updatedAt,
      };
    }).filter((row) => row.price_asset);
    res.json({
      ok: true,
      pricing: {
        asset: pricing.asset,
        price_asset: pricing.price.toFixed(18, Decimal.ROUND_DOWN),
        price_eltx: pricing.price.toFixed(18, Decimal.ROUND_DOWN),
        decimals: getSymbolDecimals(pricing.asset),
        min_usd: min,
        max_usd: max,
        updated_at: pricing.updatedAt,
      },
      prices,
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
    const assetInput = (payload.asset || ELTX_SYMBOL).toString().toUpperCase();
    if (!STRIPE_SUPPORTED_ASSETS.includes(assetInput)) {
      return next({ status: 400, code: 'UNSUPPORTED_ASSET', message: 'Unsupported purchase asset' });
    }
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

    const pricing = await getStripePricing(conn, assetInput);
    const price = pricing.price;
    const expectedPriceRaw = payload.expected_price_asset ?? payload.expected_price_eltx;
    if (expectedPriceRaw) {
      try {
        const expectedPrice = new Decimal(expectedPriceRaw);
        if (!expectedPrice.eq(price)) {
          await conn.rollback();
          return next({ status: 409, code: 'PRICE_CHANGED', message: 'Price changed, please refresh the quote.' });
        }
      } catch {}
    }
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

    const decimals = getSymbolDecimals(assetInput);
    const assetDecimal = amountDecimal.mul(price);
    const assetAmount = assetDecimal.toFixed(decimals, Decimal.ROUND_DOWN);
    const assetWei = ethers.parseUnits(assetAmount, decimals).toString();
    const eltxAmount = assetInput === ELTX_SYMBOL ? assetAmount : '0';
    const eltxWei = assetInput === ELTX_SYMBOL ? assetWei : '0';

    const [[userRow]] = await conn.query('SELECT email FROM users WHERE id=? LIMIT 1', [userId]);

    const [insert] = await conn.query(
      `INSERT INTO fiat_purchases (user_id, status, currency, asset, asset_decimals, usd_amount, usd_amount_minor, price_asset, price_eltx, asset_amount, eltx_amount, asset_amount_wei, eltx_amount_wei)
       VALUES (?, 'pending', 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        assetInput,
        decimals,
        normalizedUsd,
        amountMinor,
        price.toFixed(18, Decimal.ROUND_DOWN),
        price.toFixed(18, Decimal.ROUND_DOWN),
        assetAmount,
        eltxAmount,
        assetWei,
        eltxWei,
      ]
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
            product_data: { name: `${assetInput} Purchase` },
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
        asset: assetInput,
        price_asset: price.toFixed(18, Decimal.ROUND_DOWN),
        price_eltx: price.toFixed(18, Decimal.ROUND_DOWN),
        eltx_amount: eltxAmount,
        eltx_amount_wei: eltxWei,
        asset_amount: assetAmount,
        asset_amount_wei: assetWei,
        usd_amount: normalizedUsd,
      },
      asset: assetInput,
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
      `SELECT id, user_id, status, currency, asset, asset_decimals, usd_amount, usd_amount_minor, price_asset, price_eltx, asset_amount, eltx_amount, asset_amount_wei, eltx_amount_wei,
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
      `SELECT id, user_id, status, currency, asset, asset_decimals, usd_amount, usd_amount_minor, price_asset, price_eltx, asset_amount, eltx_amount, asset_amount_wei, eltx_amount_wei,
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
    const { email, password, language, referral_code: referralCodeRaw } = SignupSchema.parse(req.body);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const username = await generateUsernameFromEmail(conn, email);
    const [u] = await conn.query(
      'INSERT INTO users (email, username, language) VALUES (?, ?, ?)',
      [email, username, language || 'en']
    );
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await conn.query('INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)', [u.insertId, hash]);
    await ensureReferralCode(conn, u.insertId);
    const referralCode = referralCodeRaw ? referralCodeRaw.trim().toUpperCase() : null;
    if (referralCode) {
      const [[referrer]] = await conn.query('SELECT user_id FROM referral_codes WHERE code=? LIMIT 1', [referralCode]);
      if (referrer?.user_id && referrer.user_id !== u.insertId) {
        await conn.query('INSERT IGNORE INTO referrals (referrer_user_id, referred_user_id) VALUES (?, ?)', [
          referrer.user_id,
          u.insertId,
        ]);
      }
    }
    const token = crypto.randomUUID();
    await conn.query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
      [token, u.insertId, USER_SESSION_TTL_SECONDS]
    );
    const wallets = [];
    for (const cid of SUPPORTED_CHAINS) {
      wallets.push(await provisionUserAddress(conn, u.insertId, cid));
    }
    await conn.commit();
    enqueueEmail({
      kind: 'welcome',
      to: email,
      language: language || 'en',
      data: { username },
      requestId: req.requestId,
    });
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
      return next({ status: 409, code: 'USER_EXISTS', message: 'Email already exists' });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/auth/login', loginLimiter, async (req, res, next) => {
  let userId = null;
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const [rows] = await pool.query(
      'SELECT users.id, uc.password_hash FROM users JOIN user_credentials uc ON users.id=uc.user_id WHERE users.email=?',
      [email]
    );
    if (rows.length) {
      userId = rows[0].id;
      const valid = await argon2.verify(rows[0].password_hash, password);
      if (valid) {
        const token = crypto.randomUUID();
        await pool.query(
          'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
          [token, userId, USER_SESSION_TTL_SECONDS]
        );
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

app.get('/referrals/summary', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const code = await ensureReferralCode(pool, userId);
    const [rows] = await pool.query(
      `SELECT r.referred_user_id,
              u.username,
              u.email,
              u.created_at,
              rr.reward_eltx,
              rr.created_at AS rewarded_at,
              EXISTS(
                SELECT 1 FROM fiat_purchases fp WHERE fp.user_id = r.referred_user_id AND fp.status='succeeded'
              ) AS has_purchase
         FROM referrals r
         JOIN users u ON u.id = r.referred_user_id
         LEFT JOIN referral_rewards rr ON rr.referred_user_id = r.referred_user_id
        WHERE r.referrer_user_id = ?
        ORDER BY r.created_at DESC`,
      [userId]
    );

    const referrals = rows.map((row) => ({
      referred_user_id: row.referred_user_id,
      username: row.username,
      email: row.email,
      created_at: row.created_at,
      has_purchase: !!row.has_purchase,
      reward_eltx: row.reward_eltx?.toString() || '0',
      rewarded_at: row.rewarded_at || null,
    }));

    const totalInvited = referrals.length;
    const totalPurchases = referrals.filter((r) => r.has_purchase).length;
    const totalRewards = referrals.reduce((sum, row) => sum.plus(new Decimal(row.reward_eltx || '0')), new Decimal(0));

    res.json({
      ok: true,
      code,
      stats: {
        invited: totalInvited,
        purchases: totalPurchases,
        rewards_eltx: trimDecimal(totalRewards.toFixed(18, Decimal.ROUND_DOWN)),
      },
      referrals,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/kyc/me', async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      `SELECT kr.*, au.username AS reviewer_username
         FROM kyc_requests kr
         LEFT JOIN admin_users au ON kr.reviewed_by = au.id
        WHERE kr.user_id = ?
        LIMIT 1`,
      [userId]
    );
    if (!rows.length) {
      return res.json({ ok: true, status: 'none', request: null, can_resubmit: true });
    }
    const request = presentKycRow(rows[0]);
    res.json({ ok: true, status: request.status, request, can_resubmit: request.status === 'rejected' });
  } catch (err) {
    next(err);
  }
});

app.post('/kyc/submit', async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const payload = KycSubmissionSchema.parse(req.body || {});
    const file = parseBase64File(payload.document_file);

    await pool.query(
      `INSERT INTO kyc_requests (user_id, full_name, country, document_type, document_number, document_filename, document_mime, document_data, status, rejection_reason, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         full_name=VALUES(full_name),
         country=VALUES(country),
         document_type=VALUES(document_type),
         document_number=VALUES(document_number),
         document_filename=VALUES(document_filename),
         document_mime=VALUES(document_mime),
         document_data=VALUES(document_data),
         status='pending',
         rejection_reason=NULL,
         reviewed_by=NULL,
         reviewed_at=NULL`,
      [userId, payload.full_name, payload.country, payload.document_type, payload.document_number, file.name, file.mime, file.buffer]
    );

    const [[userRow]] = await pool.query('SELECT email, username, language FROM users WHERE id=? LIMIT 1', [userId]);

    const [rows] = await pool.query(
      `SELECT kr.*, au.username AS reviewer_username FROM kyc_requests kr LEFT JOIN admin_users au ON kr.reviewed_by = au.id WHERE kr.user_id=? LIMIT 1`,
      [userId]
    );
    const request = presentKycRow(rows[0]);

    enqueueEmail({
      kind: 'user-kyc-submitted',
      to: userRow?.email,
      language: userRow?.language || 'en',
      data: { username: userRow?.username, fullName: payload.full_name },
      requestId: req.requestId,
    });
    enqueueEmail({
      kind: 'admin-kyc-submitted',
      language: 'en',
      data: {
        userId,
        email: userRow?.email,
        username: userRow?.username,
        fullName: payload.full_name,
        country: payload.country,
      },
      requestId: req.requestId,
    });

    res.json({ ok: true, status: request.status, request, can_resubmit: request.status === 'rejected' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const missing = err.errors
        .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
        .map((e) => e.path[0]);
      return next({ status: 400, code: 'BAD_INPUT', message: err.errors[0]?.message || 'Invalid input', details: { missing } });
    }
    next(err);
  }
});

app.get('/support/tickets', supportLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      `SELECT t.*,
              (SELECT m.message FROM support_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_preview,
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id=t.id) AS message_count
         FROM support_tickets t
        WHERE t.user_id = ?
        ORDER BY COALESCE(t.last_message_at, t.updated_at, t.created_at) DESC, t.id DESC`,
      [userId]
    );
    res.json({ ok: true, tickets: rows.map(presentSupportTicket) });
  } catch (err) {
    next(err);
  }
});

app.get('/support/tickets/:ticketId', supportLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const ticketId = parseTicketId(req.params.ticketId);
    if (!ticketId) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ticket id' });
    const [[ticketRow]] = await pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) AS message_count,
              (SELECT sm.message FROM support_messages sm WHERE sm.ticket_id=t.id ORDER BY sm.created_at DESC, sm.id DESC LIMIT 1) AS last_message_preview
         FROM support_tickets t
        WHERE t.id=? AND t.user_id=?
        LIMIT 1`,
      [ticketId, userId]
    );
    if (!ticketRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Ticket not found' });
    const [messages] = await pool.query(
      `SELECT sm.*, u.username AS user_username, au.username AS admin_username
         FROM support_messages sm
         LEFT JOIN users u ON u.id = sm.user_id
         LEFT JOIN admin_users au ON au.id = sm.admin_id
        WHERE sm.ticket_id = ?
        ORDER BY sm.created_at ASC, sm.id ASC`,
      [ticketId]
    );
    res.json({ ok: true, ticket: presentSupportTicket(ticketRow), messages: messages.map(presentSupportMessage) });
  } catch (err) {
    next(err);
  }
});

app.post('/support/tickets', supportLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const payload = SupportTicketCreateSchema.parse(req.body || {});
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [ticketResult] = await conn.query(
      "INSERT INTO support_tickets (user_id, title, status, last_message_at, last_sender) VALUES (?, ?, 'open', NOW(), 'user')",
      [userId, payload.title]
    );
    const ticketId = ticketResult.insertId;
    const [messageResult] = await conn.query(
      'INSERT INTO support_messages (ticket_id, sender_type, user_id, admin_id, message) VALUES (?, "user", ?, NULL, ?)',
      [ticketId, userId, payload.message]
    );
    await conn.commit();
    const [[ticketRow]] = await pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) AS message_count,
              (SELECT sm.message FROM support_messages sm WHERE sm.ticket_id=t.id ORDER BY sm.created_at DESC, sm.id DESC LIMIT 1) AS last_message_preview
         FROM support_tickets t
        WHERE t.id=?`,
      [ticketId]
    );
    const [[messageRow]] = await pool.query(
      `SELECT sm.*, u.username AS user_username, au.username AS admin_username
         FROM support_messages sm
         LEFT JOIN users u ON u.id = sm.user_id
         LEFT JOIN admin_users au ON au.id = sm.admin_id
        WHERE sm.id = ?`,
      [messageResult.insertId]
    );
    const userContact = await getUserContact(userId, conn);
    const ticketPayload = {
      ticketId,
      title: payload.title,
      message: payload.message,
      user: userContact,
    };
    enqueueSupportEmails('user-created', ticketPayload);
    enqueueSupportEmails('admin-created', ticketPayload);
    res.json({
      ok: true,
      ticket: presentSupportTicket(ticketRow),
      messages: messageRow ? [presentSupportMessage(messageRow)] : [],
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ticket payload', details: err.flatten() });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/support/tickets/:ticketId/messages', supportLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const ticketId = parseTicketId(req.params.ticketId);
    if (!ticketId) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ticket id' });
    const [[ticketRow]] = await pool.query('SELECT * FROM support_tickets WHERE id=? AND user_id=? LIMIT 1', [
      ticketId,
      userId,
    ]);
    if (!ticketRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Ticket not found' });
    if (ticketRow.status === 'closed') return next({ status: 400, code: 'TICKET_CLOSED', message: 'Ticket is closed' });
    const payload = SupportReplySchema.parse(req.body || {});
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [messageResult] = await conn.query(
      'INSERT INTO support_messages (ticket_id, sender_type, user_id, admin_id, message) VALUES (?, "user", ?, NULL, ?)',
      [ticketId, userId, payload.message]
    );
    await conn.query(
      "UPDATE support_tickets SET status='open', last_message_at=NOW(), last_sender='user', closed_at=NULL, updated_at=NOW() WHERE id=?",
      [ticketId]
    );
    await conn.commit();
    const [[messageRow]] = await pool.query(
      `SELECT sm.*, u.username AS user_username, au.username AS admin_username
         FROM support_messages sm
         LEFT JOIN users u ON u.id = sm.user_id
         LEFT JOIN admin_users au ON au.id = sm.admin_id
        WHERE sm.id = ?`,
      [messageResult.insertId]
    );
    const [[updatedTicket]] = await pool.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) AS message_count,
              (SELECT sm.message FROM support_messages sm WHERE sm.ticket_id=t.id ORDER BY sm.created_at DESC, sm.id DESC LIMIT 1) AS last_message_preview
         FROM support_tickets t
        WHERE t.id=?`,
      [ticketId]
    );
    const userContact = await getUserContact(userId, conn);
    enqueueSupportEmails('user-replied', {
      ticketId,
      title: updatedTicket.title,
      message: payload.message,
      user: userContact,
    });
    res.json({
      ok: true,
      ticket: presentSupportTicket(updatedTicket),
      message: messageRow ? presentSupportMessage(messageRow) : null,
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid reply payload', details: err.flatten() });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/p2p/payment-methods', walletLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const [rows] = await pool.query(
      'SELECT id, name, code, country, is_active, dispute_delay_hours, created_at, updated_at FROM p2p_payment_methods WHERE is_active=1 ORDER BY name'
    );
    res.json({ ok: true, methods: rows.map(presentPaymentMethodRow) });
  } catch (err) {
    next(err);
  }
});

app.get('/p2p/offers', walletLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const filters = P2POffersQuerySchema.parse(req.query || {});
    const params = [];
    const conditions = ['o.status = ?'];
    params.push('active');
    let sql =
      'SELECT DISTINCT o.*, u.username FROM p2p_offers o JOIN users u ON u.id=o.user_id';
    if (filters.payment_method_id) {
      sql += ' JOIN p2p_offer_payment_methods opm ON opm.offer_id = o.id';
      conditions.push('opm.payment_method_id = ?');
      params.push(filters.payment_method_id);
    }
    if (filters.side) {
      conditions.push('o.side = ?');
      params.push(filters.side);
    }
    if (filters.asset) {
      conditions.push('o.asset = ?');
      params.push(filters.asset);
    }
    if (filters.amount) {
      const amountDecimal = parseDecimalValue(filters.amount);
      if (!amountDecimal || amountDecimal.lte(0)) {
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount filter' });
      }
      conditions.push('o.min_limit <= ? AND o.max_limit >= ?');
      const amountStr = amountDecimal.toFixed(2, Decimal.ROUND_DOWN);
      params.push(amountStr, amountStr);
    }
    sql += ` WHERE ${conditions.join(' AND ')} ORDER BY o.updated_at DESC LIMIT 100`;

    const [rows] = await pool.query(sql, params);
    const offerIds = rows.map((row) => row.id);
    let methodMap = {};
    if (offerIds.length) {
      const [methodRows] = await pool.query(
        `SELECT opm.offer_id, pm.id, pm.name
           FROM p2p_offer_payment_methods opm
           JOIN p2p_payment_methods pm ON pm.id = opm.payment_method_id
          WHERE opm.offer_id IN (?)
          ORDER BY pm.name`,
        [offerIds]
      );
      methodMap = methodRows.reduce((acc, row) => {
        if (!acc[row.offer_id]) acc[row.offer_id] = [];
        acc[row.offer_id].push({ id: row.id, name: row.name });
        return acc;
      }, {});
    }
    const offers = rows.map((row) => presentOfferRow(row, methodMap[row.id] || []));
    res.json({ ok: true, offers });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid filters', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/p2p/offers/mine', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      'SELECT o.*, u.username FROM p2p_offers o JOIN users u ON u.id=o.user_id WHERE o.user_id=? ORDER BY o.updated_at DESC LIMIT 100',
      [userId]
    );
    const offerIds = rows.map((row) => row.id);
    let methodMap = {};
    if (offerIds.length) {
      const [methodRows] = await pool.query(
        `SELECT opm.offer_id, pm.id, pm.name
           FROM p2p_offer_payment_methods opm
           JOIN p2p_payment_methods pm ON pm.id = opm.payment_method_id
          WHERE opm.offer_id IN (?)
          ORDER BY pm.name`,
        [offerIds]
      );
      methodMap = methodRows.reduce((acc, row) => {
        if (!acc[row.offer_id]) acc[row.offer_id] = [];
        acc[row.offer_id].push({ id: row.id, name: row.name });
        return acc;
      }, {});
    }
    const offers = rows.map((row) => presentOfferRow(row, methodMap[row.id] || []));
    res.json({ ok: true, offers });
  } catch (err) {
    next(err);
  }
});

app.post('/p2p/offers', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const payload = P2POfferCreateSchema.parse(req.body || {});
    const price = parseDecimalValue(payload.price);
    const minLimit = parseDecimalValue(payload.min_limit);
    const maxLimit = parseDecimalValue(payload.max_limit);
    const totalAmount = parseDecimalValue(payload.total_amount);
    if (!price || price.lte(0) || !minLimit || minLimit.lte(0) || !maxLimit || maxLimit.lte(0)) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid pricing or limits' });
    }
    if (minLimit.gt(maxLimit)) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Minimum limit exceeds maximum' });
    }
    if (!totalAmount || totalAmount.lte(0)) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid total amount' });
    }
    if (totalAmount.lt(maxLimit.div(price))) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Total amount is too low for maximum limit' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [methodRows] = await conn.query(
      'SELECT id FROM p2p_payment_methods WHERE id IN (?) AND is_active=1',
      [payload.payment_method_ids]
    );
    if (methodRows.length !== payload.payment_method_ids.length) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid payment methods' });
    }

    if (payload.side === 'sell') {
      const eligibility = await ensureSellerEligibility(conn, userId);
      if (!eligibility.eligible) {
        await conn.rollback();
        return next({
          status: 403,
          code: 'SELLER_NOT_ELIGIBLE',
          message: 'Seller eligibility window has not completed',
          details: { available_at: eligibility.availableAt?.toISOString() || null },
        });
      }
      const decimals = getSymbolDecimals(payload.asset);
      const amountWei = decimalToWeiString(totalAmount, decimals);
      if (!amountWei) {
        await conn.rollback();
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
      }
      const [balanceRows] = await conn.query(
        'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
        [userId, payload.asset]
      );
      const balanceWei = balanceRows.length ? bigIntFromValue(balanceRows[0].balance_wei || 0) : 0n;
      if (balanceWei < BigInt(amountWei)) {
        await conn.rollback();
        return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance to create offer' });
      }
    }

    const [insert] = await conn.query(
      `INSERT INTO p2p_offers
        (user_id, side, asset, currency, price, min_limit, max_limit, total_amount, available_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        payload.side,
        payload.asset,
        payload.currency || 'USD',
        price.toFixed(6, Decimal.ROUND_DOWN),
        minLimit.toFixed(2, Decimal.ROUND_DOWN),
        maxLimit.toFixed(2, Decimal.ROUND_DOWN),
        totalAmount.toFixed(18, Decimal.ROUND_DOWN),
        totalAmount.toFixed(18, Decimal.ROUND_DOWN),
      ]
    );
    const offerId = insert.insertId;
    const methodValues = payload.payment_method_ids.map((methodId) => [offerId, methodId]);
    await conn.query('INSERT INTO p2p_offer_payment_methods (offer_id, payment_method_id) VALUES ?', [methodValues]);
    await conn.commit();

    const [[offerRow]] = await pool.query(
      `SELECT o.*, u.username
         FROM p2p_offers o
         JOIN users u ON u.id=o.user_id
        WHERE o.id=?`,
      [offerId]
    );
    const [methodRowsFull] = await pool.query(
      `SELECT pm.id, pm.name
         FROM p2p_offer_payment_methods opm
         JOIN p2p_payment_methods pm ON pm.id=opm.payment_method_id
        WHERE opm.offer_id=?
        ORDER BY pm.name`,
      [offerId]
    );
    res.json({ ok: true, offer: presentOfferRow(offerRow, methodRowsFull) });
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

app.post('/p2p/offers/:id/cancel', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const { id: offerId } = P2POfferIdSchema.parse(req.params);
    const [[offer]] = await pool.query(
      `SELECT o.*, u.username
         FROM p2p_offers o
         JOIN users u ON u.id=o.user_id
        WHERE o.id=? AND o.user_id=?
        LIMIT 1`,
      [offerId, userId]
    );
    if (!offer) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Offer not found' });
    }
    if (offer.status === 'cancelled') {
      return next({ status: 400, code: 'OFFER_CANCELLED', message: 'Offer already cancelled' });
    }
    if (offer.status !== 'active' && offer.status !== 'paused') {
      return next({ status: 400, code: 'OFFER_INACTIVE', message: 'Offer is not active' });
    }

    await pool.query('UPDATE p2p_offers SET status=?, updated_at=NOW() WHERE id=?', ['cancelled', offerId]);
    const [[updated]] = await pool.query(
      `SELECT o.*, u.username
         FROM p2p_offers o
         JOIN users u ON u.id=o.user_id
        WHERE o.id=?
        LIMIT 1`,
      [offerId]
    );
    const [methodRows] = await pool.query(
      `SELECT pm.id, pm.name
         FROM p2p_offer_payment_methods opm
         JOIN p2p_payment_methods pm ON pm.id=opm.payment_method_id
        WHERE opm.offer_id=?
        ORDER BY pm.name`,
      [offerId]
    );
    res.json({ ok: true, offer: presentOfferRow(updated, methodRows) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid offer', details: err.flatten() });
    }
    next(err);
  }
});

app.post('/p2p/trades', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const payload = P2PTradeCreateSchema.parse(req.body || {});
    const fiatAmount = parseDecimalValue(payload.amount);
    if (!fiatAmount || fiatAmount.lte(0)) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[offer]] = await conn.query(
      `SELECT o.*, u.username
         FROM p2p_offers o
         JOIN users u ON u.id=o.user_id
        WHERE o.id=? FOR UPDATE`,
      [payload.offer_id]
    );
    if (!offer) {
      await conn.rollback();
      return next({ status: 404, code: 'NOT_FOUND', message: 'Offer not found' });
    }
    if (offer.status !== 'active') {
      await conn.rollback();
      return next({ status: 400, code: 'OFFER_INACTIVE', message: 'Offer is not active' });
    }
    if (!P2P_SUPPORTED_ASSETS.includes(offer.asset)) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Unsupported asset' });
    }

    const [[method]] = await conn.query(
      'SELECT id, name, is_active, dispute_delay_hours FROM p2p_payment_methods WHERE id=? LIMIT 1',
      [payload.payment_method_id]
    );
    if (!method || !method.is_active) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid payment method' });
    }
    const [methodLink] = await conn.query(
      'SELECT 1 FROM p2p_offer_payment_methods WHERE offer_id=? AND payment_method_id=? LIMIT 1',
      [payload.offer_id, payload.payment_method_id]
    );
    if (!methodLink.length) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Payment method not supported by offer' });
    }

    const price = new Decimal(offer.price);
    const minLimit = new Decimal(offer.min_limit);
    const maxLimit = new Decimal(offer.max_limit);
    if (fiatAmount.lt(minLimit) || fiatAmount.gt(maxLimit)) {
      await conn.rollback();
      return next({ status: 400, code: 'AMOUNT_OUT_OF_RANGE', message: 'Amount out of offer limits' });
    }
    const assetAmount = fiatAmount.div(price);
    const available = new Decimal(offer.available_amount || offer.total_amount);
    if (assetAmount.gt(available)) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_AVAILABLE', message: 'Offer has insufficient availability' });
    }

    const isOfferSell = offer.side === 'sell';
    const buyerId = isOfferSell ? userId : offer.user_id;
    const sellerId = isOfferSell ? offer.user_id : userId;
    if (buyerId === sellerId) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Cannot trade with yourself' });
    }

    if (!isOfferSell) {
      const eligibility = await ensureSellerEligibility(conn, sellerId);
      if (!eligibility.eligible) {
        await conn.rollback();
        return next({
          status: 403,
          code: 'SELLER_NOT_ELIGIBLE',
          message: 'Seller eligibility window has not completed',
          details: { available_at: eligibility.availableAt?.toISOString() || null },
        });
      }
    }

    const decimals = getSymbolDecimals(offer.asset);
    const assetAmountFixed = assetAmount.toFixed(18, Decimal.ROUND_DOWN);
    const amountWeiStr = decimalToWeiString(assetAmountFixed, decimals);
    if (!amountWeiStr) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    }
    const amountWei = BigInt(amountWeiStr);

    const [balanceRows] = await conn.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE',
      [sellerId, offer.asset]
    );
    const sellerBalance = balanceRows.length ? bigIntFromValue(balanceRows[0].balance_wei || 0) : 0n;
    if (sellerBalance < amountWei) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Seller balance is insufficient' });
    }

    await conn.query('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?', [
      amountWei.toString(),
      sellerId,
      offer.asset,
    ]);

    const [tradeInsert] = await conn.query(
      `INSERT INTO p2p_trades
        (offer_id, buyer_id, seller_id, payment_method_id, asset, currency, price, amount, fiat_amount, status, escrow_amount_wei)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'payment_pending', ?)`,
      [
        offer.id,
        buyerId,
        sellerId,
        payload.payment_method_id,
        offer.asset,
        offer.currency || 'USD',
        price.toFixed(6, Decimal.ROUND_DOWN),
        assetAmountFixed,
        fiatAmount.toFixed(2, Decimal.ROUND_DOWN),
        amountWei.toString(),
      ]
    );
    const tradeId = tradeInsert.insertId;

    await conn.query(
      'INSERT INTO p2p_escrows (trade_id, user_id, asset, amount_wei, status) VALUES (?, ?, ?, ?, ?)',
      [tradeId, sellerId, offer.asset, amountWei.toString(), 'locked']
    );

    const newAvailable = available.minus(assetAmount);
    const newStatus = newAvailable.lte(0) ? 'paused' : 'active';
    await conn.query('UPDATE p2p_offers SET available_amount=?, status=? WHERE id=?', [
      newAvailable.toFixed(18, Decimal.ROUND_DOWN),
      newStatus,
      offer.id,
    ]);

    await conn.commit();

    const context = await getP2PTradeEmailContext(tradeId);
    if (context) {
      enqueueP2PStatusEmails(context, 'payment_pending');
      enqueueAdminP2PEmail(context, 'new trade');
    }
    const [[tradeRow]] = await pool.query(
      `SELECT t.*, pm.name AS payment_method_name, bu.username AS buyer_username, su.username AS seller_username
         FROM p2p_trades t
         JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
         JOIN users bu ON bu.id=t.buyer_id
         JOIN users su ON su.id=t.seller_id
        WHERE t.id=?`,
      [tradeId]
    );
    res.json({ ok: true, trade: presentTradeRow(tradeRow) });
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

app.get('/p2p/trades', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      `SELECT t.*, pm.name AS payment_method_name, bu.username AS buyer_username, su.username AS seller_username
         FROM p2p_trades t
         JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
         JOIN users bu ON bu.id=t.buyer_id
         JOIN users su ON su.id=t.seller_id
        WHERE t.buyer_id=? OR t.seller_id=?
        ORDER BY t.created_at DESC
        LIMIT 100`,
      [userId, userId]
    );
    res.json({ ok: true, trades: rows.map(presentTradeRow) });
  } catch (err) {
    next(err);
  }
});

app.get('/p2p/trades/:id', walletLimiter, async (req, res, next) => {
  const tradeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid trade id' });
  try {
    const userId = await requireUser(req);
    const [[tradeRow]] = await pool.query(
      `SELECT t.*, pm.name AS payment_method_name, pm.dispute_delay_hours, bu.username AS buyer_username, su.username AS seller_username
         FROM p2p_trades t
         JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
         JOIN users bu ON bu.id=t.buyer_id
         JOIN users su ON su.id=t.seller_id
        WHERE t.id=?`,
      [tradeId]
    );
    if (!tradeRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Trade not found' });
    if (tradeRow.buyer_id !== userId && tradeRow.seller_id !== userId) {
      return next({ status: 403, code: 'FORBIDDEN', message: 'Not allowed' });
    }
    const [messageRows] = await pool.query(
      `SELECT m.id, m.message, m.sender_id, u.username, m.created_at
         FROM p2p_messages m
         JOIN users u ON u.id=m.sender_id
        WHERE m.trade_id=?
        ORDER BY m.created_at ASC`,
      [tradeId]
    );
    const canDisputeAt = addHours(new Date(tradeRow.created_at), Number(tradeRow.dispute_delay_hours || 0));
    res.json({
      ok: true,
      trade: { ...presentTradeRow(tradeRow), dispute_delay_hours: Number(tradeRow.dispute_delay_hours || 0), can_dispute_at: canDisputeAt?.toISOString() || null },
      messages: messageRows.map((row) => ({
        id: row.id,
        message: row.message,
        sender_id: row.sender_id,
        username: publicUsername(row.username, row.sender_id),
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

app.post('/p2p/trades/:id/messages', walletLimiter, async (req, res, next) => {
  const tradeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid trade id' });
  try {
    const userId = await requireUser(req);
    const payload = P2PMessageSchema.parse(req.body || {});
    const [[tradeRow]] = await pool.query(
      'SELECT buyer_id, seller_id, status FROM p2p_trades WHERE id=? LIMIT 1',
      [tradeId]
    );
    if (!tradeRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Trade not found' });
    if (tradeRow.buyer_id !== userId && tradeRow.seller_id !== userId) {
      return next({ status: 403, code: 'FORBIDDEN', message: 'Not allowed' });
    }
    if (tradeRow.status === 'completed') {
      return next({ status: 400, code: 'TRADE_CLOSED', message: 'Trade chat is closed' });
    }
    await pool.query('INSERT INTO p2p_messages (trade_id, sender_id, message) VALUES (?, ?, ?)', [
      tradeId,
      userId,
      payload.message.trim(),
    ]);
    const [[messageRow]] = await pool.query(
      `SELECT m.id, m.message, m.sender_id, u.username, m.created_at
         FROM p2p_messages m
         JOIN users u ON u.id=m.sender_id
        WHERE m.trade_id=?
        ORDER BY m.created_at DESC
        LIMIT 1`,
      [tradeId]
    );
    res.json({
      ok: true,
      message: {
        id: messageRow.id,
        message: messageRow.message,
        sender_id: messageRow.sender_id,
        username: messageRow.username,
        created_at: messageRow.created_at,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.post('/p2p/trades/:id/mark-paid', walletLimiter, async (req, res, next) => {
  const tradeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid trade id' });
  try {
    const userId = await requireUser(req);
    const [[tradeRow]] = await pool.query(
      `SELECT t.id, t.status, t.buyer_id
         FROM p2p_trades t
        WHERE t.id=? LIMIT 1`,
      [tradeId]
    );
    if (!tradeRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Trade not found' });
    if (tradeRow.buyer_id !== userId) return next({ status: 403, code: 'FORBIDDEN', message: 'Only buyer can mark paid' });
    if (tradeRow.status !== 'payment_pending') {
      return next({ status: 400, code: 'BAD_STATE', message: 'Trade is not awaiting payment' });
    }
    await pool.query('UPDATE p2p_trades SET status=?, paid_at=NOW(), updated_at=NOW() WHERE id=?', ['paid', tradeId]);
    const context = await getP2PTradeEmailContext(tradeId);
    if (context) {
      enqueueP2PStatusEmails(context, 'paid');
      enqueueAdminP2PEmail(context, 'paid');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/p2p/trades/:id/release', walletLimiter, async (req, res, next) => {
  const tradeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid trade id' });
  let conn;
  try {
    const userId = await requireUser(req);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[tradeRow]] = await conn.query(
      'SELECT id, seller_id, buyer_id, asset, status, escrow_amount_wei FROM p2p_trades WHERE id=? FOR UPDATE',
      [tradeId]
    );
    if (!tradeRow) {
      await conn.rollback();
      return next({ status: 404, code: 'NOT_FOUND', message: 'Trade not found' });
    }
    if (tradeRow.seller_id !== userId) {
      await conn.rollback();
      return next({ status: 403, code: 'FORBIDDEN', message: 'Only seller can release' });
    }
    if (tradeRow.status !== 'paid') {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Trade is not marked as paid' });
    }
    const amountWei = bigIntFromValue(tradeRow.escrow_amount_wei || 0);
    if (amountWei <= 0n) {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Escrow is empty' });
    }
    await conn.query('UPDATE p2p_escrows SET status=? WHERE trade_id=?', ['released', tradeId]);
    await conn.query(
      'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
      [tradeRow.buyer_id, tradeRow.asset, amountWei.toString()]
    );
    await conn.query('UPDATE p2p_trades SET status=?, released_at=NOW(), updated_at=NOW() WHERE id=?', [
      'released',
      tradeId,
    ]);
    await conn.commit();
    const context = await getP2PTradeEmailContext(tradeId);
    if (context) {
      enqueueP2PStatusEmails(context, 'released');
      enqueueAdminP2PEmail(context, 'released');
    }
    res.json({ ok: true });
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

app.post('/p2p/trades/:id/complete', walletLimiter, async (req, res, next) => {
  const tradeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid trade id' });
  try {
    const userId = await requireUser(req);
    const [[tradeRow]] = await pool.query('SELECT buyer_id, status FROM p2p_trades WHERE id=? LIMIT 1', [tradeId]);
    if (!tradeRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Trade not found' });
    if (tradeRow.buyer_id !== userId) {
      return next({ status: 403, code: 'FORBIDDEN', message: 'Only buyer can complete trade' });
    }
    if (tradeRow.status !== 'released') {
      return next({ status: 400, code: 'BAD_STATE', message: 'Trade is not released yet' });
    }
    await pool.query('UPDATE p2p_trades SET status=?, completed_at=NOW(), updated_at=NOW() WHERE id=?', [
      'completed',
      tradeId,
    ]);
    const context = await getP2PTradeEmailContext(tradeId);
    if (context) {
      enqueueP2PStatusEmails(context, 'completed');
      enqueueAdminP2PEmail(context, 'completed');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/p2p/trades/:id/dispute', walletLimiter, async (req, res, next) => {
  const tradeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tradeId) || tradeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid trade id' });
  let conn;
  try {
    const userId = await requireUser(req);
    const payload = P2PDisputeSchema.parse(req.body || {});
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[tradeRow]] = await conn.query(
      `SELECT t.*, pm.dispute_delay_hours
         FROM p2p_trades t
         JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
        WHERE t.id=? FOR UPDATE`,
      [tradeId]
    );
    if (!tradeRow) {
      await conn.rollback();
      return next({ status: 404, code: 'NOT_FOUND', message: 'Trade not found' });
    }
    if (tradeRow.buyer_id !== userId && tradeRow.seller_id !== userId) {
      await conn.rollback();
      return next({ status: 403, code: 'FORBIDDEN', message: 'Not allowed' });
    }
    if (tradeRow.status === 'completed') {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Trade already completed' });
    }
    if (tradeRow.status === 'released') {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Trade already released' });
    }
    if (tradeRow.status === 'disputed') {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Trade already disputed' });
    }
    const delayHours = Number(tradeRow.dispute_delay_hours || 0);
    const allowAt = addHours(new Date(tradeRow.created_at), delayHours);
    if (allowAt && Date.now() < allowAt.getTime()) {
      await conn.rollback();
      return next({
        status: 403,
        code: 'DISPUTE_TOO_EARLY',
        message: 'Dispute window has not opened',
        details: { available_at: allowAt.toISOString() },
      });
    }
    await conn.query('UPDATE p2p_trades SET status=?, disputed_at=NOW(), updated_at=NOW() WHERE id=?', [
      'disputed',
      tradeId,
    ]);
    const [insert] = await conn.query(
      'INSERT INTO p2p_disputes (trade_id, opened_by, reason, evidence, status) VALUES (?, ?, ?, ?, ?)',
      [tradeId, userId, payload.reason, payload.evidence || null, 'open']
    );
    await conn.commit();
    const context = await getP2PTradeEmailContext(tradeId);
    if (context) {
      const note = payload.reason ? `Reason: ${payload.reason}` : undefined;
      enqueueP2PStatusEmails(context, 'disputed', note);
      enqueueAdminP2PEmail(context, 'disputed', note);
    }
    res.json({ ok: true, dispute_id: insert.insertId });
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

app.get('/admin/withdrawals', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const statusRaw = (req.query.status || 'pending').toString();
    const status = WITHDRAWAL_STATUS.includes(statusRaw) ? statusRaw : 'all';
    const where = status === 'all' ? '' : 'WHERE w.status = ?';
    const params = status === 'all' ? [] : [status];
    const [rows] = await pool.query(
      `SELECT w.*, u.email AS user_email, u.username AS user_username
         FROM wallet_withdrawals w
         JOIN users u ON u.id = w.user_id
        ${where}
        ORDER BY w.created_at DESC
        LIMIT 200`,
      params
    );
    res.json({ ok: true, requests: rows.map(formatWithdrawalRow) });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/withdrawals/:id', async (req, res, next) => {
  let conn;
  try {
    const admin = await requireAdmin(req);
    const { status, reason } = AdminWithdrawalUpdateSchema.parse(req.body || {});
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid id' });

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[row]] = await conn.query('SELECT * FROM wallet_withdrawals WHERE id=? FOR UPDATE', [id]);
    if (!row) {
      await conn.rollback();
      return next({ status: 404, code: 'NOT_FOUND', message: 'Request not found' });
    }
    if (row.status !== 'pending') {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Request already processed' });
    }

    const amountWeiStr = row.amount_wei?.toString() || '0';
    const normalized = amountWeiStr.includes('.') ? amountWeiStr.split('.')[0] : amountWeiStr;
    const amountWei = BigInt(normalized);
    const asset = row.asset || ELTX_SYMBOL;

    if (status === 'rejected') {
      await conn.query(
        `INSERT INTO user_balances (user_id, asset, balance_wei)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
        [row.user_id, asset, amountWei.toString()]
      );
      await conn.query('DELETE FROM platform_fees WHERE fee_type=? AND reference=?', ['withdrawal', `withdrawal:${id}`]);
    }

    await conn.query(
      `UPDATE wallet_withdrawals
          SET status=?,
              reject_reason=?,
              handled_by_admin_id=?,
              handled_at=NOW(),
              updated_at=NOW()
        WHERE id=?`,
      [status, status === 'rejected' ? reason || null : null, admin.id, id]
    );
    await conn.commit();

    const [[updated]] = await conn.query(
      `SELECT w.*, u.email AS user_email, u.username AS user_username
         FROM wallet_withdrawals w
         JOIN users u ON u.id = w.user_id
        WHERE w.id=?
        LIMIT 1`,
      [id]
    );
    const userContact = await getUserContact(updated.user_id, conn);
    const formatted = formatWithdrawalRow({
      ...updated,
      user_email: userContact?.email || updated.user_email,
      user_username: userContact?.username || updated.user_username,
    });
    enqueueWithdrawalEmails('updated', formatted, userContact);
    res.json({ ok: true, request: formatted });
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

app.get('/admin/support/tickets', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const statusRaw = (req.query.status || 'open').toString();
    const status = SUPPORT_STATUSES.includes(statusRaw) || statusRaw === 'all' ? statusRaw : 'open';
    const where = status === 'all' ? '' : 'WHERE t.status = ?';
    const params = status === 'all' ? [] : [status];
    const [rows] = await pool.query(
      `SELECT t.*,
              u.email AS user_email,
              u.username AS user_username,
              (SELECT m.message FROM support_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_preview,
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id=t.id) AS message_count
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        ${where}
        ORDER BY COALESCE(t.last_message_at, t.updated_at, t.created_at) DESC, t.id DESC
        LIMIT 200`,
      params
    );
    const tickets = rows.map((row) => ({
      ...presentSupportTicket(row),
      user_email: row.user_email,
      user_username: row.user_username,
    }));
    res.json({ ok: true, tickets });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/support/tickets/:ticketId', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const ticketId = parseTicketId(req.params.ticketId);
    if (!ticketId) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ticket id' });
    const [[ticketRow]] = await pool.query(
      `SELECT t.*, u.email AS user_email, u.username AS user_username,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) AS message_count,
              (SELECT sm.message FROM support_messages sm WHERE sm.ticket_id=t.id ORDER BY sm.created_at DESC, sm.id DESC LIMIT 1) AS last_message_preview
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        WHERE t.id=?
        LIMIT 1`,
      [ticketId]
    );
    if (!ticketRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Ticket not found' });
    const [messages] = await pool.query(
      `SELECT sm.*, u.username AS user_username, au.username AS admin_username
         FROM support_messages sm
         LEFT JOIN users u ON u.id = sm.user_id
         LEFT JOIN admin_users au ON au.id = sm.admin_id
        WHERE sm.ticket_id = ?
        ORDER BY sm.created_at ASC, sm.id ASC`,
      [ticketId]
    );
    res.json({
      ok: true,
      ticket: {
        ...presentSupportTicket(ticketRow),
        user_email: ticketRow.user_email,
        user_username: ticketRow.user_username,
      },
      messages: messages.map(presentSupportMessage),
    });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/support/tickets/:ticketId/messages', async (req, res, next) => {
  let conn;
  try {
    const admin = await requireAdmin(req);
    const ticketId = parseTicketId(req.params.ticketId);
    if (!ticketId) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ticket id' });
    const [[ticketRow]] = await pool.query(
      `SELECT t.*, u.email AS user_email, u.username AS user_username
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        WHERE t.id=?
        LIMIT 1`,
      [ticketId]
    );
    if (!ticketRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Ticket not found' });
    if (ticketRow.status === 'closed') return next({ status: 400, code: 'TICKET_CLOSED', message: 'Ticket is closed' });
    const payload = SupportReplySchema.parse(req.body || {});
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [messageResult] = await conn.query(
      'INSERT INTO support_messages (ticket_id, sender_type, user_id, admin_id, message) VALUES (?, "admin", NULL, ?, ?)',
      [ticketId, admin.id, payload.message]
    );
    await conn.query(
      "UPDATE support_tickets SET status='answered', last_message_at=NOW(), last_sender='admin', updated_at=NOW() WHERE id=?",
      [ticketId]
    );
    await conn.commit();
    const [[messageRow]] = await pool.query(
      `SELECT sm.*, u.username AS user_username, au.username AS admin_username
         FROM support_messages sm
         LEFT JOIN users u ON u.id = sm.user_id
         LEFT JOIN admin_users au ON au.id = sm.admin_id
        WHERE sm.id = ?`,
      [messageResult.insertId]
    );
    const [[updatedTicket]] = await pool.query(
      `SELECT t.*, u.email AS user_email, u.username AS user_username,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) AS message_count,
              (SELECT sm.message FROM support_messages sm WHERE sm.ticket_id=t.id ORDER BY sm.created_at DESC, sm.id DESC LIMIT 1) AS last_message_preview
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        WHERE t.id=?`,
      [ticketId]
    );
    const userContact = await getUserContact(ticketRow.user_id, conn);
    enqueueSupportEmails('admin-replied', {
      ticketId,
      title: updatedTicket.title,
      message: payload.message,
      user: userContact,
      adminUsername: admin.username,
    });
    res.json({
      ok: true,
      ticket: {
        ...presentSupportTicket(updatedTicket),
        user_email: updatedTicket.user_email,
        user_username: updatedTicket.user_username,
      },
      message: messageRow ? presentSupportMessage(messageRow) : null,
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid reply payload', details: err.flatten() });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

app.patch('/admin/support/tickets/:ticketId/status', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const ticketId = parseTicketId(req.params.ticketId);
    if (!ticketId) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ticket id' });
    const payload = SupportStatusUpdateSchema.parse(req.body || {});
    const [[ticketRow]] = await pool.query(
      `SELECT t.*, u.email AS user_email, u.username AS user_username
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        WHERE t.id=?
        LIMIT 1`,
      [ticketId]
    );
    if (!ticketRow) return next({ status: 404, code: 'NOT_FOUND', message: 'Ticket not found' });
    await pool.query(
      `UPDATE support_tickets
          SET status=?,
              closed_at = CASE WHEN ? = 'closed' THEN NOW() ELSE NULL END,
              updated_at = NOW()
        WHERE id=?`,
      [payload.status, payload.status, ticketId]
    );
    const [[updatedTicket]] = await pool.query(
      `SELECT t.*, u.email AS user_email, u.username AS user_username,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) AS message_count,
              (SELECT sm.message FROM support_messages sm WHERE sm.ticket_id=t.id ORDER BY sm.created_at DESC, sm.id DESC LIMIT 1) AS last_message_preview
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        WHERE t.id=?`,
      [ticketId]
    );
    res.json({
      ok: true,
      ticket: {
        ...presentSupportTicket(updatedTicket),
        user_email: updatedTicket.user_email,
        user_username: updatedTicket.user_username,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid status payload', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/p2p/payment-methods', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const [rows] = await pool.query(
      'SELECT id, name, code, country, is_active, dispute_delay_hours, created_at, updated_at FROM p2p_payment_methods ORDER BY name'
    );
    res.json({ ok: true, methods: rows.map(presentPaymentMethodRow) });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/p2p/payment-methods', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const payload = P2PPaymentMethodSchema.parse(req.body || {});
    const [insert] = await pool.query(
      `INSERT INTO p2p_payment_methods (name, code, country, dispute_delay_hours, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        payload.name,
        payload.code || null,
        payload.country || null,
        payload.dispute_delay_hours ?? 0,
        payload.is_active === undefined ? 1 : payload.is_active ? 1 : 0,
      ]
    );
    const [[row]] = await pool.query(
      'SELECT id, name, code, country, is_active, dispute_delay_hours, created_at, updated_at FROM p2p_payment_methods WHERE id=?',
      [insert.insertId]
    );
    res.json({ ok: true, method: presentPaymentMethodRow(row) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.patch('/admin/p2p/payment-methods/:id', async (req, res, next) => {
  const methodId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(methodId) || methodId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid payment method id' });
  try {
    await requireAdmin(req);
    const updates = P2PPaymentMethodUpdateSchema.parse(req.body || {});
    const fields = [];
    const params = [];
    if (updates.name !== undefined) {
      fields.push('name=?');
      params.push(updates.name);
    }
    if (updates.code !== undefined) {
      fields.push('code=?');
      params.push(updates.code || null);
    }
    if (updates.country !== undefined) {
      fields.push('country=?');
      params.push(updates.country || null);
    }
    if (updates.dispute_delay_hours !== undefined) {
      fields.push('dispute_delay_hours=?');
      params.push(updates.dispute_delay_hours);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active=?');
      params.push(updates.is_active ? 1 : 0);
    }
    if (!fields.length) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'No updates provided' });
    }
    params.push(methodId);
    await pool.query(`UPDATE p2p_payment_methods SET ${fields.join(', ')} WHERE id=?`, params);
    const [[row]] = await pool.query(
      'SELECT id, name, code, country, is_active, dispute_delay_hours, created_at, updated_at FROM p2p_payment_methods WHERE id=?',
      [methodId]
    );
    res.json({ ok: true, method: presentPaymentMethodRow(row) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
  }
});

app.get('/admin/p2p/trades', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const [rows] = await pool.query(
      `SELECT t.*, pm.name AS payment_method_name, bu.username AS buyer_username, su.username AS seller_username
         FROM p2p_trades t
         JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
         JOIN users bu ON bu.id=t.buyer_id
         JOIN users su ON su.id=t.seller_id
        ORDER BY t.created_at DESC
        LIMIT 200`
    );
    res.json({ ok: true, trades: rows.map(presentTradeRow) });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/p2p/disputes', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const [rows] = await pool.query(
      `SELECT d.*, t.asset, t.amount, t.fiat_amount, t.status AS trade_status,
              t.buyer_id, t.seller_id,
              bu.username AS buyer_username, su.username AS seller_username,
              pm.name AS payment_method_name, au.username AS admin_username
         FROM p2p_disputes d
         JOIN p2p_trades t ON t.id=d.trade_id
         JOIN users bu ON bu.id=t.buyer_id
         JOIN users su ON su.id=t.seller_id
         JOIN p2p_payment_methods pm ON pm.id=t.payment_method_id
         LEFT JOIN admin_users au ON au.id=d.admin_id
        ORDER BY d.created_at DESC
        LIMIT 200`
    );
    const disputes = rows.map((row) => ({
      id: row.id,
      trade_id: row.trade_id,
      opened_by: row.opened_by,
      status: row.status,
      reason: row.reason,
      evidence: row.evidence,
      resolution: row.resolution,
      admin_username: row.admin_username,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      trade: {
        asset: row.asset,
        amount: trimDecimal(row.amount),
        fiat_amount: formatDecimalValue(row.fiat_amount, 2),
        status: row.trade_status,
        buyer_username: publicUsername(row.buyer_username, row.buyer_id),
        seller_username: publicUsername(row.seller_username, row.seller_id),
        payment_method_name: row.payment_method_name,
      },
    }));
    res.json({ ok: true, disputes });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/p2p/disputes/:id/resolve', async (req, res, next) => {
  const disputeId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(disputeId) || disputeId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid dispute id' });
  let conn;
  try {
    const admin = await requireAdmin(req);
    const payload = P2PDisputeResolveSchema.parse(req.body || {});
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[dispute]] = await conn.query(
      `SELECT d.*, t.seller_id, t.buyer_id, t.asset, t.escrow_amount_wei, t.status AS trade_status
         FROM p2p_disputes d
         JOIN p2p_trades t ON t.id=d.trade_id
        WHERE d.id=? FOR UPDATE`,
      [disputeId]
    );
    if (!dispute) {
      await conn.rollback();
      return next({ status: 404, code: 'NOT_FOUND', message: 'Dispute not found' });
    }
    if (dispute.status !== 'open') {
      await conn.rollback();
      return next({ status: 400, code: 'BAD_STATE', message: 'Dispute already resolved' });
    }
    const amountWei = bigIntFromValue(dispute.escrow_amount_wei || 0);
    if (amountWei > 0n) {
      if (payload.resolution === 'buyer') {
        await conn.query('UPDATE p2p_escrows SET status=? WHERE trade_id=?', ['released', dispute.trade_id]);
        await conn.query(
          'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
          [dispute.buyer_id, dispute.asset, amountWei.toString()]
        );
      } else {
        await conn.query('UPDATE p2p_escrows SET status=? WHERE trade_id=?', ['refunded', dispute.trade_id]);
        await conn.query(
          'INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)',
          [dispute.seller_id, dispute.asset, amountWei.toString()]
        );
      }
    }
    await conn.query(
      'UPDATE p2p_trades SET status=?, completed_at=NOW(), updated_at=NOW(), released_at=IFNULL(released_at, NOW()) WHERE id=?',
      ['completed', dispute.trade_id]
    );
    await conn.query(
      'UPDATE p2p_disputes SET status=?, resolution=?, admin_id=?, resolved_at=NOW(), updated_at=NOW() WHERE id=?',
      ['resolved', payload.resolution, admin.id, disputeId]
    );
    await conn.commit();
    const context = await getP2PTradeEmailContext(dispute.trade_id);
    if (context) {
      const note = payload.resolution === 'buyer' ? 'Released to buyer' : 'Refunded to seller';
      enqueueP2PStatusEmails(context, 'completed', note);
      enqueueAdminP2PEmail(context, 'resolved', note);
    }
    res.json({ ok: true });
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

app.get('/admin/market-maker/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const settings = await readMarketMakerSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/market-maker/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const parsed = MarketMakerSettingsSchema.parse(req.body || {});
    const updates = { ...parsed };
    if (parsed.pairs !== undefined) {
      if (typeof parsed.pairs === 'string') {
        updates.pairs = parsed.pairs
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length >= 3);
      } else {
        updates.pairs = parsed.pairs;
      }
    }
    await updateMarketMakerSettings(updates);
    const settings = await readMarketMakerSettings();
    res.json({ ok: true, settings });
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
    if (updates.withdrawal_fee_bps !== undefined)
      tasks.push(setPlatformSettingValue('withdrawal_fee_bps', updates.withdrawal_fee_bps.toString()));
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

app.get('/admin/referrals/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const settings = await readReferralSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/referrals/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const payload = ReferralSettingsSchema.parse(req.body || {});
    const reward = normalizePositiveDecimal(payload.reward_eltx, 18);
    if (reward === null) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid referral reward' });
    await setPlatformSettingValue(REFERRAL_REWARD_SETTING, reward);
    const settings = await readReferralSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid referral settings', details: err.flatten() });
    next(err);
  }
});

app.get('/admin/email/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const settings = presentEmailSettings(await readEmailSettings());
    const smtp = getSmtpStatus();
    res.json({
      ok: true,
      settings,
      smtp: {
        ready: smtp.ready,
        missing: smtp.missing || [],
        host: smtp.host,
        from: smtp.from,
        user: smtp.user,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/email/settings', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const payload = EmailSettingsSchema.parse(req.body || {});
    const tasks = [];
    if (payload.enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.enabled, payload.enabled ? '1' : '0'));
    if (payload.from_address !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.from, payload.from_address || ''));
    if (payload.admin_recipients !== undefined) {
      const recipients = parseEmailList(payload.admin_recipients);
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.adminRecipients, recipients.join(',')));
    }
    if (payload.user_welcome_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.userWelcome, payload.user_welcome_enabled ? '1' : '0'));
    if (payload.user_kyc_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.userKyc, payload.user_kyc_enabled ? '1' : '0'));
    if (payload.admin_kyc_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.adminKyc, payload.admin_kyc_enabled ? '1' : '0'));
    if (payload.user_p2p_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.userP2P, payload.user_p2p_enabled ? '1' : '0'));
    if (payload.admin_p2p_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.adminP2P, payload.admin_p2p_enabled ? '1' : '0'));
    if (payload.user_withdrawal_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.userWithdrawal, payload.user_withdrawal_enabled ? '1' : '0'));
    if (payload.admin_withdrawal_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.adminWithdrawal, payload.admin_withdrawal_enabled ? '1' : '0'));
    if (payload.user_support_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.userSupport, payload.user_support_enabled ? '1' : '0'));
    if (payload.admin_support_enabled !== undefined)
      tasks.push(setPlatformSettingValue(EMAIL_SETTING_KEYS.adminSupport, payload.admin_support_enabled ? '1' : '0'));
    await Promise.all(tasks);
    invalidateEmailSettingsCache();
    const settings = presentEmailSettings(await readEmailSettings(pool, { forceReload: true }));
    const smtp = getSmtpStatus();
    res.json({
      ok: true,
      settings,
      smtp: {
        ready: smtp.ready,
        missing: smtp.missing || [],
        host: smtp.host,
        from: smtp.from,
        user: smtp.user,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid email settings', details: err.flatten() });
    next(err);
  }
});

app.post('/admin/email/announcement', async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    const payload = EmailAnnouncementSchema.parse(req.body || {});
    const settings = await readEmailSettings();
    if (!settings.enabled) return next({ status: 400, code: 'EMAIL_DISABLED', message: 'Email notifications are disabled' });
    const smtp = getSmtpStatus();
    if (!smtp.ready) return next({ status: 400, code: 'SMTP_NOT_READY', message: 'SMTP is not configured' });
    const queued = await queueAnnouncementEmails(payload, req.requestId, admin?.username || admin?.email);
    res.json({ ok: true, queued });
  } catch (err) {
    if (err instanceof z.ZodError)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid announcement payload', details: err.flatten() });
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

app.get('/admin/stripe/pricing', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const pricing = await getStripePricing(pool);
    const priceEltx =
      pricing.prices?.[ELTX_SYMBOL]?.toFixed(18, Decimal.ROUND_DOWN) || pricing.price.toFixed(18, Decimal.ROUND_DOWN);
    const priceUsdt =
      pricing.prices?.USDT?.toFixed(18, Decimal.ROUND_DOWN) || pricing.price.toFixed(18, Decimal.ROUND_DOWN);
    const assets = STRIPE_SUPPORTED_ASSETS.map((sym) => {
      const price = pricing.prices?.[sym];
      return {
        asset: sym,
        price_asset: price ? price.toFixed(18, Decimal.ROUND_DOWN) : null,
        price_eltx: price ? price.toFixed(18, Decimal.ROUND_DOWN) : null,
        decimals: getSymbolDecimals(sym),
        updated_at: pricing.updatedAt,
      };
    }).filter((row) => row.price_asset);
    res.json({
      ok: true,
      pricing: {
        asset: pricing.asset,
        price_eltx: priceEltx,
        price_usdt: priceUsdt,
        min_usd: pricing.min.toFixed(2, Decimal.ROUND_UP),
        max_usd: pricing.max ? pricing.max.toFixed(2, Decimal.ROUND_DOWN) : null,
        updated_at: pricing.updatedAt,
        assets,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.patch('/admin/stripe/pricing', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const updates = AdminStripePricingUpdateSchema.parse(req.body || {});

    const [[row]] = await pool.query('SELECT id FROM stripe_pricing WHERE id=1 LIMIT 1');
    if (!row) {
      await pool.query('INSERT INTO stripe_pricing (id, price_eltx, min_usd) VALUES (1, 1, 10)');
    }

    const fields = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(updates, 'price_eltx')) {
      const normalized = normalizePositiveDecimal(updates.price_eltx, 18);
      if (normalized === null)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid ELTX price value' });
      fields.push('price_eltx = ?');
      params.push(normalized);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'price_usdt')) {
      const normalized = normalizePositiveDecimal(updates.price_usdt, 18);
      if (normalized === null)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid USDT price value' });
      fields.push('price_usdt = ?');
      params.push(normalized);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'min_usd')) {
      const normalized = normalizePositiveDecimal(updates.min_usd, 18);
      if (normalized === null)
        return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid minimum purchase amount' });
      fields.push('min_usd = ?');
      params.push(normalized);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'max_usd')) {
      if (updates.max_usd === null) {
        fields.push('max_usd = NULL');
      } else {
        const normalized = normalizePositiveDecimal(updates.max_usd, 18);
        if (normalized === null)
          return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid maximum purchase amount' });
        fields.push('max_usd = ?');
        params.push(normalized);
      }
    }

    if (fields.length) {
      params.push(1);
      await pool.query(`UPDATE stripe_pricing SET ${fields.join(', ')}, updated_at = NOW() WHERE id=?`, params);
    }

    const pricing = await getStripePricing(pool);
    const priceEltx =
      pricing.prices?.[ELTX_SYMBOL]?.toFixed(18, Decimal.ROUND_DOWN) || pricing.price.toFixed(18, Decimal.ROUND_DOWN);
    const priceUsdt =
      pricing.prices?.USDT?.toFixed(18, Decimal.ROUND_DOWN) || pricing.price.toFixed(18, Decimal.ROUND_DOWN);
    const assets = STRIPE_SUPPORTED_ASSETS.map((sym) => {
      const price = pricing.prices?.[sym];
      return {
        asset: sym,
        price_asset: price ? price.toFixed(18, Decimal.ROUND_DOWN) : null,
        price_eltx: price ? price.toFixed(18, Decimal.ROUND_DOWN) : null,
        decimals: getSymbolDecimals(sym),
        updated_at: pricing.updatedAt,
      };
    }).filter((row) => row.price_asset);
    res.json({
      ok: true,
      pricing: {
        asset: pricing.asset,
        price_eltx: priceEltx,
        price_usdt: priceUsdt,
        min_usd: pricing.min.toFixed(2, Decimal.ROUND_UP),
        max_usd: pricing.max ? pricing.max.toFixed(2, Decimal.ROUND_DOWN) : null,
        updated_at: pricing.updatedAt,
        assets,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid Stripe pricing', details: err.flatten() });
    }
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

    const [[lastLoginRow]] = await pool.query(
      'SELECT attempted_at FROM login_attempts WHERE user_id=? AND success=1 ORDER BY attempted_at DESC LIMIT 1',
      [userId]
    );

    const [[lastStripePurchaseRow]] = await pool.query(
      `SELECT id, currency, usd_amount, completed_at, created_at
         FROM fiat_purchases
        WHERE user_id=? AND status='succeeded'
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT 1`,
      [userId]
    );

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
      `SELECT id, status, asset, asset_decimals, usd_amount, asset_amount, eltx_amount, price_asset, price_eltx, created_at, updated_at
         FROM fiat_purchases
         WHERE user_id=?
         ORDER BY created_at DESC
         LIMIT 50`,
      [userId]
    );

    const fiat = fiatRows.map((row) => ({
      id: row.id,
      status: row.status,
      asset: (row.asset || ELTX_SYMBOL).toUpperCase(),
      usd_amount: formatDecimalValue(row.usd_amount || 0, 2),
      asset_amount: trimDecimal(row.asset_amount || row.eltx_amount),
      eltx_amount: trimDecimal(row.eltx_amount),
      price_asset: trimDecimal(row.price_asset ?? row.price_eltx),
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

    const [kycRows] = await pool.query(
      `SELECT kr.*, u.email, u.username, u.language, au.username AS reviewer_username
         FROM kyc_requests kr
         JOIN users u ON u.id = kr.user_id
         LEFT JOIN admin_users au ON au.id = kr.reviewed_by
        WHERE kr.user_id = ? AND kr.status = ?
        ORDER BY kr.reviewed_at DESC, kr.updated_at DESC, kr.created_at DESC
        LIMIT 1`,
      [userId, 'approved']
    );
    const approvedKyc = kycRows.length ? presentKycRow(kycRows[0]) : null;

    res.json({
      ok: true,
      user: {
        ...user,
        last_login_at: lastLoginRow?.attempted_at || null,
      },
      last_stripe_purchase: lastStripePurchaseRow
        ? {
            id: lastStripePurchaseRow.id,
            currency: lastStripePurchaseRow.currency,
            usd_amount: formatDecimalValue(lastStripePurchaseRow.usd_amount || 0, 2),
            completed_at: lastStripePurchaseRow.completed_at,
            created_at: lastStripePurchaseRow.created_at,
          }
        : null,
      balances,
      staking,
      fiat,
      deposits,
      transfers,
      kyc: approvedKyc,
    });
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

app.get('/admin/kyc/requests', async (req, res, next) => {
  try {
    await requireAdmin(req);
    const { status, limit } = AdminKycQuerySchema.parse(req.query || {});
    const params = [];
    let sql =
      'SELECT kr.*, u.email, u.username, u.language, au.username AS reviewer_username FROM kyc_requests kr JOIN users u ON u.id = kr.user_id LEFT JOIN admin_users au ON au.id = kr.reviewed_by';
    if (status) {
      sql += ' WHERE kr.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY kr.created_at DESC LIMIT ?';
    params.push(limit);
    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, requests: rows.map((row) => presentKycRow(row, { includeDocument: true })) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid filters', details: err.flatten() });
    }
    next(err);
  }
});

app.patch('/admin/kyc/requests/:id', async (req, res, next) => {
  const requestId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(requestId) || requestId <= 0)
    return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid request id' });
  try {
    const admin = await requireAdmin(req);
    const payload = AdminKycDecisionSchema.parse(req.body || {});
    if (payload.status === 'rejected' && !payload.rejection_reason)
      return next({ status: 400, code: 'BAD_INPUT', message: 'Rejection reason is required' });

    const [[existing]] = await pool.query(
      'SELECT kr.*, u.email, u.username, u.language, au.username AS reviewer_username FROM kyc_requests kr JOIN users u ON u.id = kr.user_id LEFT JOIN admin_users au ON au.id = kr.reviewed_by WHERE kr.id=?',
      [requestId]
    );
    if (!existing) return next({ status: 404, code: 'NOT_FOUND', message: 'KYC request not found' });

    await pool.query(
      'UPDATE kyc_requests SET status=?, rejection_reason=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?',
      [payload.status, payload.status === 'rejected' ? payload.rejection_reason : null, admin.id, requestId]
    );

    const [[updated]] = await pool.query(
      'SELECT kr.*, u.email, u.username, u.language, au.username AS reviewer_username FROM kyc_requests kr JOIN users u ON u.id = kr.user_id LEFT JOIN admin_users au ON au.id = kr.reviewed_by WHERE kr.id=?',
      [requestId]
    );

    const userLanguage = updated?.language || 'en';
    const decisionKind = payload.status === 'approved' ? 'user-kyc-approved' : 'user-kyc-rejected';
    enqueueEmail({
      kind: decisionKind,
      to: updated?.email,
      language: userLanguage,
      data: { username: updated?.username, reason: payload.rejection_reason || '' },
      requestId: req.requestId,
    });

    res.json({ ok: true, request: presentKycRow(updated, { includeDocument: true }) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid input', details: err.flatten() });
    }
    next(err);
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
              min_base_amount, min_quote_amount, price_precision, amount_precision, active, allow_market_orders, created_at, updated_at
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
      allow_market_orders: row.allow_market_orders === undefined || row.allow_market_orders === null ? true : !!row.allow_market_orders,
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
    if (updates.allow_market_orders !== undefined) {
      fields.push('allow_market_orders = ?');
      params.push(updates.allow_market_orders ? 1 : 0);
    }
    if (!fields.length) return next({ status: 400, code: 'BAD_INPUT', message: 'No fields to update' });
    params.push(symbol);
    await pool.query(`UPDATE spot_markets SET ${fields.join(', ')}, updated_at = NOW() WHERE symbol = ?`, params);
    const [[market]] = await pool.query(
      `SELECT id, symbol, base_asset, base_decimals, quote_asset, quote_decimals, min_base_amount, min_quote_amount,
              price_precision, amount_precision, active, allow_market_orders, created_at, updated_at
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
      `SELECT id, user_id, status, currency, asset, asset_decimals, usd_amount, price_asset, price_eltx, asset_amount, eltx_amount, asset_amount_wei, eltx_amount_wei,
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
      asset: (row.asset || ELTX_SYMBOL).toUpperCase(),
      asset_decimals: Number(row.asset_decimals || getSymbolDecimals(row.asset || ELTX_SYMBOL)),
      price_asset: trimDecimal(row.price_asset ?? row.price_eltx),
      price_eltx: trimDecimal(row.price_eltx),
      eltx_amount: trimDecimal(row.eltx_amount),
      asset_amount: trimDecimal(row.asset_amount ?? row.eltx_amount),
      eltx_amount_wei: bigIntFromValue(row.eltx_amount_wei || 0).toString(),
      asset_amount_wei: bigIntFromValue(row.asset_amount_wei || row.eltx_amount_wei || 0).toString(),
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
    const limitParam = Number.parseInt(req.query.limit, 10);
    const pageParam = Number.parseInt(req.query.page, 10);
    const statusParam = (req.query.status || 'all').toString();
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const offset = (page - 1) * limit;
    const statusFilter = statusParam === 'pending' ? 'pending' : statusParam === 'confirmed' ? 'confirmed' : 'all';

    const depositStatuses =
      statusFilter === 'pending'
        ? ['seen']
        : statusFilter === 'confirmed'
          ? ['confirmed', 'swept']
          : ['seen', 'confirmed', 'swept', 'orphaned'];
    const includeTransfers = statusFilter !== 'pending';

    const depositWhere = depositStatuses.length ? ` AND status IN (${depositStatuses.map(() => '?').join(',')})` : '';
    const depositParams = [userId, ...depositStatuses];
    const [[{ deposit_count: depositCount = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS deposit_count FROM wallet_deposits WHERE user_id=?${depositWhere}`,
      depositParams
    );

    let transferCount = 0;
    if (includeTransfers) {
      const [[{ tx_count = 0 } = {}]] = await pool.query(
        'SELECT COUNT(*) AS tx_count FROM wallet_transfers WHERE from_user_id=? OR to_user_id=?',
        [userId, userId]
      );
      transferCount = Number(tx_count || 0);
    }

    const total = Number(depositCount || 0) + transferCount;

    const unionParts = [
      {
        sql: `SELECT 'deposit' AS tx_type, chain_id, tx_hash, token_address, token_symbol, amount_wei, confirmations, status, created_at, NULL AS from_user_id, NULL AS to_user_id, 0 AS fee_wei
              FROM wallet_deposits
              WHERE user_id=?${depositWhere}`,
        params: depositParams,
      },
    ];
    if (includeTransfers) {
      unionParts.push({
        sql: `SELECT 'transfer' AS tx_type, NULL AS chain_id, NULL AS tx_hash, NULL AS token_address, asset AS token_symbol, amount_wei, 0 AS confirmations, 'transfer' AS status, created_at, from_user_id, to_user_id, fee_wei
              FROM wallet_transfers
              WHERE from_user_id=? OR to_user_id=?`,
        params: [userId, userId],
      });
    }

    const unionSql = unionParts.map((p) => p.sql).join('\nUNION ALL\n');
    const unionParams = unionParts.flatMap((p) => p.params);
    const [rows] = await pool.query(
      `SELECT * FROM (
        ${unionSql}
      ) AS tx
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
      [...unionParams, limit, offset]
    );

    const ZERO = '0x0000000000000000000000000000000000000000';
    const transactions = rows.map((row) => {
      if (row.tx_type === 'deposit') {
        const tokenAddress = (row.token_address || ZERO).toLowerCase();
        const amountWei = toPlainIntegerString(row.amount_wei);
        const base = {
          tx_hash: row.tx_hash,
          token_address: tokenAddress,
          token_symbol: row.token_symbol,
          amount_wei: amountWei,
          amount_int: amountWei,
          confirmations: row.confirmations,
          status: row.status,
          created_at: row.created_at,
          type: 'deposit',
          chain_id: row.chain_id,
        };
        if (tokenAddress === ZERO) {
          const decimals = 18;
          return {
            ...base,
            display_symbol: row.token_symbol || 'BNB',
            decimals,
            amount_formatted: formatUnitsStr(amountWei, decimals),
          };
        }
        const meta = tokenMeta[tokenAddress];
        const decimals = meta ? meta.decimals : 18;
        return {
          ...base,
          display_symbol: row.token_symbol || (meta ? meta.symbol : 'UNKNOWN'),
          decimals,
          amount_formatted: formatUnitsStr(amountWei, decimals),
        };
      }

      const incoming = row.to_user_id === userId;
      const sym = row.token_symbol || '';
      const meta = sym === 'BNB' || sym === 'ETH' ? { decimals: 18 } : tokenMetaBySymbol[sym];
      const decimals = meta ? meta.decimals : 18;
      const amtWei = BigInt(toPlainIntegerString(row.amount_wei));
      const feeWei = BigInt(toPlainIntegerString(row.fee_wei));
      const net = incoming ? amtWei - feeWei : amtWei;
      return {
        tx_hash: null,
        token_address: ZERO,
        token_symbol: sym,
        amount_wei: net.toString(),
        amount_int: net.toString(),
        display_symbol: sym,
        decimals,
        amount_formatted: formatUnitsStr(net.toString(), decimals),
        confirmations: 0,
        status: incoming ? 'received' : 'sent',
        created_at: row.created_at,
        type: 'transfer',
        direction: incoming ? 'in' : 'out',
        counterparty: incoming ? row.from_user_id : row.to_user_id,
        chain_id: null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      ok: true,
      transactions,
      pagination: {
        page,
        page_size: limit,
        total,
        total_pages: totalPages,
        has_more: offset + transactions.length < total,
      },
    });
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
        logo_url: null,
      });
      symbolSet.add(sym);
    }

    if (assets.length) {
      const symbols = Array.from(symbolSet);
      const logoMap = await fetchAssetLogos(symbols);
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
        asset.logo_url = logoMap.get(asset.symbol) || null;
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

app.get('/wallet/withdrawals', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const feeVal = await getPlatformSettingValue('withdrawal_fee_bps', DEFAULT_WITHDRAWAL_FEE_BPS.toString());
    const feeBps = Number(clampBps(BigInt(Number.parseInt(feeVal, 10) || 0)));
    const [rows] = await pool.query(
      `SELECT id, user_id, asset, asset_decimals, amount_wei, fee_bps, fee_wei, net_amount_wei, chain, address, reason, status, reject_reason, handled_by_admin_id, handled_at, created_at, updated_at
         FROM wallet_withdrawals
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 50`,
      [userId]
    );
    res.json({ ok: true, requests: rows.map(formatWithdrawalRow), fee_bps: feeBps });
  } catch (err) {
    next(err);
  }
});

app.post('/wallet/withdrawals', walletLimiter, async (req, res, next) => {
  let conn;
  try {
    const userId = await requireUser(req);
    const payload = WithdrawalCreateSchema.parse(req.body || {});
    const reason = payload.reason ? payload.reason.trim() : null;
    const asset = payload.asset.toUpperCase();
    const decimals = getSymbolDecimals(asset);
    const amountWeiStr = decimalToWeiString(payload.amount, decimals);
    if (!amountWeiStr) return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Invalid amount' });
    const amountWei = bigIntFromValue(amountWeiStr);
    if (amountWei <= 0n)
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Invalid amount' });
    const feeVal = await getPlatformSettingValue('withdrawal_fee_bps', DEFAULT_WITHDRAWAL_FEE_BPS.toString());
    const feeBps = clampBps(BigInt(Number.parseInt(feeVal, 10) || 0));
    const feeWei = (amountWei * feeBps) / 10000n;
    const netWei = amountWei - feeWei;
    if (netWei <= 0n)
      return next({ status: 400, code: 'INVALID_AMOUNT', message: 'Amount must exceed withdrawal fee' });

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[lastPurchase]] = await conn.query(
      "SELECT created_at FROM fiat_purchases WHERE user_id=? AND status='succeeded' ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (!lastPurchase) {
      await conn.rollback();
      return next({
        status: 400,
        code: 'WITHDRAWAL_NOT_ELIGIBLE',
        message: 'A successful Stripe purchase is required before withdrawing.',
      });
    }
    const lastPurchaseAt = new Date(lastPurchase.created_at);
    const availableAt = new Date(lastPurchaseAt.getTime() + 24 * 60 * 60 * 1000);
    if (Date.now() < availableAt.getTime()) {
      await conn.rollback();
      return next({
        status: 400,
        code: 'WITHDRAWAL_TOO_EARLY',
        message: 'Withdrawals are available 24 hours after your last purchase.',
        details: { available_at: availableAt.toISOString() },
      });
    }

    const [[pending]] = await conn.query(
      'SELECT id FROM wallet_withdrawals WHERE user_id=? AND status=? LIMIT 1',
      [userId, 'pending']
    );
    if (pending) {
      await conn.rollback();
      return next({
        status: 400,
        code: 'WITHDRAWAL_EXISTS',
        message: 'You already have a pending withdrawal request.',
      });
    }

    const [balanceRows] = await conn.query(
      'SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=? FOR UPDATE',
      [userId, asset]
    );
    if (!balanceRows.length) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }
    const balanceWei = bigIntFromValue(balanceRows[0].balance_wei);
    if (balanceWei <= 0n || balanceWei < amountWei) {
      await conn.rollback();
      return next({ status: 400, code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' });
    }

    await conn.query(
      'UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND asset=?',
      [amountWei.toString(), userId, asset]
    );
    const [insert] = await conn.query(
      `INSERT INTO wallet_withdrawals (user_id, asset, asset_decimals, amount_wei, fee_bps, fee_wei, net_amount_wei, chain, address, reason, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', NOW(), NOW())`,
      [
        userId,
        asset,
        decimals,
        amountWei.toString(),
        Number(feeBps),
        feeWei.toString(),
        netWei.toString(),
        payload.chain,
        payload.address,
        reason,
      ]
    );
    if (feeWei > 0n) {
      await conn.query('INSERT INTO platform_fees (fee_type, reference, asset, amount_wei) VALUES (?,?,?,?)', [
        'withdrawal',
        `withdrawal:${insert.insertId}`,
        asset,
        feeWei.toString(),
      ]);
    }
    await conn.commit();
    const [[row]] = await conn.query('SELECT * FROM wallet_withdrawals WHERE id=? LIMIT 1', [insert.insertId]);
    const userContact = await getUserContact(userId, conn);
    const formatted = formatWithdrawalRow({ ...row, user_email: userContact?.email, user_username: userContact?.username });
    enqueueWithdrawalEmails('created', formatted, userContact);
    res.json({ ok: true, request: formatted });
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
    const meta =
      asset === 'BNB' || asset === 'ETH'
        ? { decimals: 18 }
        : tokenMetaBySymbol[asset] || (asset === ELTX_SYMBOL ? { decimals: getSymbolDecimals(asset) } : null);
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

app.get('/spot/markets', spotLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const [rows] = await pool.query(
      `SELECT sm.id, sm.symbol, sm.base_asset, sm.base_decimals, sm.quote_asset, sm.quote_decimals, sm.min_base_amount, sm.min_quote_amount,
              sm.price_precision, sm.amount_precision, sm.active, sm.allow_market_orders,
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
        allow_market_orders: row.allow_market_orders === undefined || row.allow_market_orders === null ? true : !!row.allow_market_orders,
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

app.get('/spot/orderbook', spotLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const { market } = SpotOrderbookSchema.parse({ market: req.query.market });
    const marketRow = await getSpotMarket(pool, market);
    if (!marketRow || !marketRow.active)
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });

    const { orderbook, trades, orderbookVersion, lastTradeId } = await readSpotOrderbookSnapshot(pool, marketRow);

    res.json({
      ok: true,
      market: {
        symbol: marketRow.symbol,
        base_asset: marketRow.base_asset,
        quote_asset: marketRow.quote_asset,
      },
      orderbook,
      trades,
      orderbook_version: orderbookVersion,
      last_trade_id: lastTradeId,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/spot/changes', spotLimiter, async (req, res, next) => {
  try {
    await requireUser(req);
    const query = SpotDeltaSchema.parse({
      market: req.query.market,
      last_trade_id: req.query.last_trade_id,
      orderbook_version_ts: req.query.orderbook_version_ts,
      orderbook_version_id: req.query.orderbook_version_id,
    });
    const marketRow = await getSpotMarket(pool, query.market);
    if (!marketRow || !marketRow.active)
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not found' });

    const version = { ts: query.orderbook_version_ts, id: query.orderbook_version_id };
    const [orderbookDelta, tradeDelta] = await Promise.all([
      readSpotOrderbookDeltas(pool, marketRow, version),
      readSpotTradeDeltas(pool, marketRow, query.last_trade_id),
    ]);

    res.json({
      ok: true,
      market: { symbol: marketRow.symbol, base_asset: marketRow.base_asset, quote_asset: marketRow.quote_asset },
      orderbook_version: orderbookDelta.version,
      orderbook_deltas: orderbookDelta.deltas,
      last_trade_id: tradeDelta.lastTradeId,
      trades: tradeDelta.trades,
    });
  } catch (err) {
    next(err);
  }
});

async function handleSpotWebsocketConnection(socket, req) {
  let closed = false;
  let updating = false;
  let lastOrderbookVersion = { ts: 0, id: 0 };
  let lastTradeId = 0;
  let heartbeatTimer;
  let deltaTimer;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (deltaTimer) clearInterval(deltaTimer);
  };

  const send = (type, payload) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type, payload }));
  };

  const sendError = (message, code = 1011) => {
    send('error', { message });
    try {
      socket.close(code, message);
    } catch {
      // ignore
    }
    cleanup();
  };

  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const { market } = SpotOrderbookSchema.parse({ market: url.searchParams.get('market') });
    req.cookies = { ...(req.cookies || {}), ...parseCookies(req.headers.cookie || '') };
    const userId = await requireUser(req);
    const marketRow = await getSpotMarket(pool, market);
    if (!marketRow || !marketRow.active) {
      return sendError('Market not found', 4404);
    }

    const pushSnapshot = async () => {
      const [snapshot, orders, balances, fees] = await Promise.all([
        readSpotOrderbookSnapshot(pool, marketRow),
        readSpotOrdersForUser(pool, userId, marketRow),
        readUserBalancesForAssets(pool, userId, [marketRow.base_asset, marketRow.quote_asset]),
        readSpotFeeBps(pool),
      ]);
      lastOrderbookVersion = snapshot.orderbookVersion;
      lastTradeId = snapshot.lastTradeId;
      send('snapshot', {
        market: {
          symbol: marketRow.symbol,
          base_asset: marketRow.base_asset,
          quote_asset: marketRow.quote_asset,
        },
        orderbook_version: lastOrderbookVersion,
        last_trade_id: lastTradeId,
        orderbook: snapshot.orderbook,
        trades: snapshot.trades,
        orders,
        balances,
        fees: { maker_bps: fees.maker, taker_bps: fees.taker },
      });
    };

    const pushUpdate = async () => {
      if (closed || updating) return;
      updating = true;
      try {
        const [orderbookDelta, tradeDelta] = await Promise.all([
          readSpotOrderbookDeltas(pool, marketRow, lastOrderbookVersion),
          readSpotTradeDeltas(pool, marketRow, lastTradeId),
        ]);

        const hasChange = orderbookDelta.deltas.length > 0 || tradeDelta.trades.length > 0;
        if (!hasChange) return;

        const [orders, balances, snapshot, fees] = await Promise.all([
          readSpotOrdersForUser(pool, userId, marketRow),
          readUserBalancesForAssets(pool, userId, [marketRow.base_asset, marketRow.quote_asset]),
          readSpotOrderbookSnapshot(pool, marketRow),
          readSpotFeeBps(pool),
        ]);
        lastOrderbookVersion = snapshot.orderbookVersion;
        lastTradeId = snapshot.lastTradeId;

        send('update', {
          orderbook_version: lastOrderbookVersion,
          last_trade_id: lastTradeId,
          orderbook: snapshot.orderbook,
          trades: snapshot.trades,
          orders,
          balances,
          fees: { maker_bps: fees.maker, taker_bps: fees.taker },
        });
      } catch (err) {
        send('error', { message: err?.message || 'Stream error' });
      } finally {
        updating = false;
      }
    };

    const heartbeatMs = Number(
      (await getPlatformSettingValue('spot_stream_heartbeat_ms', '12000').catch(() => '12000')) || '12000'
    );
    const deltaIntervalMs = Number(
      (await getPlatformSettingValue('spot_stream_delta_interval_ms', '1200').catch(() => '1200')) || '1200'
    );

    socket.on('close', cleanup);
    socket.on('error', cleanup);

    await pushSnapshot();
    heartbeatTimer = setInterval(() => send('ping', { ts: Date.now() }), heartbeatMs);
    deltaTimer = setInterval(() => {
      pushUpdate().catch((err) => send('error', { message: err?.message || 'Stream error' }));
    }, deltaIntervalMs);
  } catch (err) {
    sendError(err?.message || 'Stream error');
    cleanup();
  }
}

app.get('/spot/stream', spotLimiter, async (req, res, next) => {
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
    let lastOrderbookVersion = { ts: 0, id: 0 };
    let lastTradeId = 0;

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
        lastOrderbookVersion = snapshot.orderbookVersion;
        lastTradeId = snapshot.lastTradeId;
        send('snapshot', {
          market: {
            symbol: marketRow.symbol,
            base_asset: marketRow.base_asset,
            quote_asset: marketRow.quote_asset,
          },
          orderbook_version: lastOrderbookVersion,
          last_trade_id: lastTradeId,
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

    const pushDeltas = async () => {
      try {
        const [orderbookDelta, tradeDelta] = await Promise.all([
          readSpotOrderbookDeltas(pool, marketRow, lastOrderbookVersion),
          readSpotTradeDeltas(pool, marketRow, lastTradeId),
        ]);

        const hasOrderbookChange = orderbookDelta.deltas.length > 0;
        const hasTradeChange = tradeDelta.trades.length > 0;

        if (hasOrderbookChange) {
          lastOrderbookVersion = orderbookDelta.version;
          send('orderbook_delta', {
            version: lastOrderbookVersion,
            deltas: orderbookDelta.deltas,
          });
        }

        if (hasTradeChange) {
          lastTradeId = tradeDelta.lastTradeId;
          send('trades_delta', {
            last_trade_id: lastTradeId,
            trades: tradeDelta.trades,
          });
        }

        if (hasOrderbookChange || hasTradeChange) {
          const [orders, balances] = await Promise.all([
            readSpotOrdersForUser(pool, userId, marketRow),
            readUserBalancesForAssets(pool, userId, [marketRow.base_asset, marketRow.quote_asset]),
          ]);
          send('account', { orders, balances });
        }
      } catch (err) {
        send('error', { message: err?.message || 'Stream error' });
      }
    };

    const heartbeatMs = Number(
      (await getPlatformSettingValue('spot_stream_heartbeat_ms', '12000').catch(() => '12000')) || '12000'
    );
    const deltaIntervalMs = Number(
      (await getPlatformSettingValue('spot_stream_delta_interval_ms', '1200').catch(() => '1200')) || '1200'
    );

    const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), heartbeatMs);
    const interval = setInterval(pushDeltas, deltaIntervalMs);
    await pushSnapshot();

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

app.get('/spot/candles', spotLimiter, async (req, res, next) => {
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
       ORDER BY created_at DESC
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

    const tradesChronological = [...tradeRows].reverse();

    for (const row of tradesChronological) {
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

app.get('/spot/orders', spotLimiter, async (req, res, next) => {
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
    const { market: rawMarket, side, type, amount, price, time_in_force } = SpotOrderSchema.parse(req.body);
    let timeInForce = (time_in_force || 'gtc').toLowerCase();
    if (type === 'market' && timeInForce === 'gtc') timeInForce = 'ioc';
    const marketSymbol = normalizeMarketSymbol(rawMarket);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const market = await getSpotMarket(conn, marketSymbol, { forUpdate: true });
    if (!market || !market.active) {
      await conn.rollback();
      return next({ status: 404, code: 'MARKET_NOT_FOUND', message: 'Market not available' });
    }
    if (type === 'market' && market.allow_market_orders === 0) {
      await conn.rollback();
      return next({ status: 400, code: 'MARKET_ORDER_DISABLED', message: 'Market orders disabled for this market' });
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

      const estimate = await estimateSpotMarketFill(conn, market, { side, baseAmountWei: amountWei });
      if (estimate.filledBase <= 0n) {
        await conn.rollback();
        return next({ status: 400, code: 'NO_LIQUIDITY', message: 'Insufficient orderbook liquidity' });
      }
      if (timeInForce === 'fok' && estimate.filledBase < amountWei) {
        await conn.rollback();
        return next({ status: 400, code: 'FOK_INCOMPLETE', message: 'Order could not be fully filled immediately' });
      }
      const expectedSlippageBps = computeRelativeBps(estimate.averagePriceWei, bestReference);
      if (expectedSlippageBps > riskSettings.maxSlippageBps) {
        await conn.rollback();
        return next({ status: 400, code: 'SLIPPAGE_EXCEEDED', message: 'Expected slippage exceeds max limit' });
      }
      const lastTradePrice = await getSpotLastTradePriceWei(conn, market.id);
      if (lastTradePrice && lastTradePrice > 0n) {
        const expectedDeviationBps = computeRelativeBps(estimate.averagePriceWei, lastTradePrice);
        if (expectedDeviationBps > riskSettings.maxDeviationBps) {
          await conn.rollback();
          return next({ status: 400, code: 'PRICE_DEVIATION_EXCEEDED', message: 'Order deviates from reference price' });
        }
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
      timeInForce,
    };

    const matchResult = await matchSpotOrder(conn, market, taker);

    if (timeInForce === 'fok' && matchResult.filledBase < amountWei) {
      await conn.rollback();
      return next({ status: 400, code: 'FOK_INCOMPLETE', message: 'Order could not be fully filled immediately' });
    }

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

    const isImmediateOrCancel = type === 'market' || timeInForce !== 'gtc';
    let orderStatus = 'open';
    if (isImmediateOrCancel) {
      orderStatus = matchResult.filledBase > 0n ? 'filled' : 'cancelled';
    } else if (taker.remainingBase <= 0n) {
      orderStatus = 'filled';
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

    if (isImmediateOrCancel) {
      taker.remainingBase = 0n;
      remainingQuote = 0n;
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

async function ensureStripePricingRow(conn) {
  try {
    await conn.query(
      'INSERT IGNORE INTO stripe_pricing (id, price_eltx, price_usdt, min_usd, max_usd) VALUES (1, 1, 1, 10, NULL)'
    );
    await conn.query(
      'UPDATE stripe_pricing SET price_usdt = CASE WHEN price_usdt IS NULL OR price_usdt <= 0 THEN price_eltx ELSE price_usdt END WHERE id=1'
    );
  } catch (err) {
    console.warn('[stripe] failed to initialize stripe_pricing row', err.message || err);
  }
}

async function getStripePricing(conn = pool, asset = ELTX_SYMBOL) {
  await ensureStripePricingRow(conn);

  const [rows] = await conn.query(
    'SELECT price_eltx, price_usdt, min_usd, max_usd, updated_at FROM stripe_pricing WHERE id=1 LIMIT 1'
  );
  const row = rows[0];

  if (!row)
    throw { status: 503, code: 'STRIPE_PRICING_MISSING', message: 'Stripe pricing is not configured.' };

  const prices = {};
  const targetAsset = (asset || ELTX_SYMBOL).toUpperCase();

  try {
    const eltxPrice = new Decimal(row.price_eltx);
    if (eltxPrice.isFinite() && eltxPrice.gt(0)) prices[ELTX_SYMBOL] = eltxPrice;
  } catch {}

  try {
    const usdtPrice = new Decimal(row.price_usdt ?? row.price_eltx);
    if (usdtPrice.isFinite() && usdtPrice.gt(0)) prices.USDT = usdtPrice;
  } catch {}

  const price = prices[targetAsset] || prices[ELTX_SYMBOL];
  if (!price || !price.isFinite() || price.lte(0))
    throw {
      status: 503,
      code: 'STRIPE_PRICE_INVALID',
      message: `Invalid Stripe ${targetAsset} price. Please configure pricing.`,
    };

  let min;
  try {
    min = new Decimal(row.min_usd);
  } catch {}
  if (!min || !min.isFinite() || min.lte(0))
    throw { status: 503, code: 'STRIPE_MIN_INVALID', message: 'Invalid Stripe minimum amount. Please configure pricing.' };

  let max = null;
  if (row.max_usd !== null && row.max_usd !== undefined) {
    try {
      const candidate = new Decimal(row.max_usd);
      if (candidate.isFinite() && candidate.gt(0)) max = candidate;
    } catch {}
  }

  return { asset: targetAsset, price, min, max, updatedAt: row?.updated_at || null, prices };
}

function formatFiatPurchaseRow(row) {
  const assetSymbol = (row.asset || ELTX_SYMBOL).toUpperCase();
  const decimalsRaw = row.asset_decimals !== undefined && row.asset_decimals !== null ? Number(row.asset_decimals) : null;
  const assetDecimals = Number.isFinite(decimalsRaw) && decimalsRaw > 0 ? decimalsRaw : getSymbolDecimals(assetSymbol);
  const priceAssetRaw = row.price_asset !== undefined && row.price_asset !== null ? row.price_asset : row.price_eltx;
  const assetAmountRaw =
    row.asset_amount !== undefined && row.asset_amount !== null ? row.asset_amount : row.eltx_amount;
  const assetAmountWeiRaw =
    row.asset_amount_wei !== undefined && row.asset_amount_wei !== null ? row.asset_amount_wei : row.eltx_amount_wei;
  const usdMinorRaw = row.usd_amount_minor !== undefined && row.usd_amount_minor !== null ? row.usd_amount_minor : 0;
  const usdMinor = Number(usdMinorRaw);
  return {
    id: row.id,
    status: row.status,
    asset: assetSymbol,
    asset_decimals: assetDecimals,
    usd_amount: row.usd_amount?.toString() || '0',
    usd_amount_minor: Number.isFinite(usdMinor) ? usdMinor : 0,
    price_asset: priceAssetRaw?.toString() || row.price_eltx?.toString() || '0',
    price_eltx: row.price_eltx?.toString() || priceAssetRaw?.toString() || '0',
    eltx_amount: row.eltx_amount?.toString() || '0',
    eltx_amount_wei: toPlainIntegerString(row.eltx_amount_wei),
    asset_amount: assetAmountRaw?.toString() || row.eltx_amount?.toString() || '0',
    asset_amount_wei: toPlainIntegerString(assetAmountWeiRaw),
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

  const assetSymbol = (purchase.asset || ELTX_SYMBOL).toUpperCase();
  const decimalsRaw =
    purchase.asset_decimals !== undefined && purchase.asset_decimals !== null ? Number(purchase.asset_decimals) : null;
  const assetDecimals = Number.isFinite(decimalsRaw) && decimalsRaw > 0 ? decimalsRaw : getSymbolDecimals(assetSymbol);
  const amountWei = BigInt(toPlainIntegerString(purchase.asset_amount_wei ?? purchase.eltx_amount_wei));
  if (amountWei <= 0n) {
    await conn.query('UPDATE fiat_purchases SET credited=1, credited_at=NOW() WHERE id=?', [purchase.id]);
    return;
  }

  await conn.query(
    `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
    [purchase.user_id, assetSymbol, amountWei.toString()]
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
    [purchase.user_id, 0, 'stripe', assetSymbol, txHash, 'stripe', ZERO_ADDRESS, amountWei.toString()]
  );
  const depositId = depositRes.insertId;

  await conn.query(
    'UPDATE fiat_purchases SET credited=1, credited_at=NOW(), wallet_deposit_id=COALESCE(wallet_deposit_id, ?) WHERE id=?',
    [depositId, purchase.id]
  );
}

async function processReferralRewardForPurchase(purchaseId, userId) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[referral]] = await conn.query(
      'SELECT referrer_user_id FROM referrals WHERE referred_user_id=? FOR UPDATE',
      [userId]
    );
    if (!referral) {
      await conn.rollback();
      return;
    }

    const [[existingReward]] = await conn.query(
      'SELECT id FROM referral_rewards WHERE referred_user_id=? FOR UPDATE',
      [userId]
    );
    if (existingReward) {
      await conn.rollback();
      return;
    }

    const [[purchaseCount]] = await conn.query(
      "SELECT COUNT(*) AS total FROM fiat_purchases WHERE user_id=? AND status='succeeded'",
      [userId]
    );
    if (Number(purchaseCount?.total || 0) !== 1) {
      await conn.rollback();
      return;
    }

    const settings = await readReferralSettings(conn);
    const rewardDecimal = new Decimal(settings.reward_eltx || '0');
    if (!rewardDecimal.isFinite() || rewardDecimal.lte(0)) {
      await conn.rollback();
      return;
    }

    const decimals = getSymbolDecimals(ELTX_SYMBOL);
    const rewardWeiStr = decimalToWeiString(rewardDecimal, decimals);
    if (!rewardWeiStr) {
      await conn.rollback();
      return;
    }
    const rewardWei = bigIntFromValue(rewardWeiStr);
    if (rewardWei <= 0n) {
      await conn.rollback();
      return;
    }

    await conn.query(
      `INSERT INTO user_balances (user_id, asset, balance_wei, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)`,
      [referral.referrer_user_id, ELTX_SYMBOL, rewardWei.toString()]
    );

    await conn.query(
      `INSERT INTO referral_rewards (referrer_user_id, referred_user_id, purchase_id, reward_eltx, reward_wei)
       VALUES (?, ?, ?, ?, ?)`,
      [
        referral.referrer_user_id,
        userId,
        purchaseId,
        rewardDecimal.toFixed(Math.min(decimals, 18), Decimal.ROUND_DOWN),
        rewardWei.toString(),
      ]
    );

    await conn.commit();
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    console.error('[referrals] failed to process referral reward', err);
  } finally {
    if (conn) conn.release();
  }
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
    try {
      await processReferralRewardForPurchase(purchaseId, purchase.user_id);
    } catch (err) {
      console.error('[referrals] reward processing failed', err);
    }
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

const spotWsServer = new WebSocketServer({ noServer: true });
spotWsServer.on('connection', (socket, req) => {
  handleSpotWebsocketConnection(socket, req).catch((err) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'error', payload: { message: err?.message || 'Stream error' } }));
    }
    try {
      socket.close(1011, 'STREAM_ERROR');
    } catch {
      // ignore
    }
  });
});

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  try {
    const { pathname } = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (pathname === '/spot/ws') {
      spotWsServer.handleUpgrade(req, socket, head, (ws) => {
        spotWsServer.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  } catch (err) {
    socket.destroy();
  }
});

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`API running on port ${port}`);
});
