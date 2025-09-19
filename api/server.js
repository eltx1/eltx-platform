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
const { provisionUserAddress, getUserBalance } = require('./src/services/wallet');
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

// start background scanner runner
const startRunner = require('./background/runner');
startRunner(pool);

// ensure wallet tables exist
(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/wallet.sql'), 'utf8');
    const statements = schema
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));
    const conn = await pool.getConnection();
    try {
      for (const sql of statements) {
        if (/DROP COLUMN IF EXISTS/i.test(sql) || /DROP INDEX IF EXISTS/i.test(sql)) {
          const table = sql.match(/ALTER TABLE\s+([`\w]+)/i)[1].replace(/`/g, '');
          try {
            const [tbl] = await conn.query('SHOW TABLES LIKE ?', [table]);
            if (!tbl.length) {
              console.warn(`table ${table} missing, skip drop`);
            } else {
              if (/DROP COLUMN IF EXISTS/i.test(sql)) {
                const dropCols = [...sql.matchAll(/DROP COLUMN IF EXISTS\s+([`\w]+)/gi)].map((m) =>
                  m[1].replace(/`/g, '')
                );
                for (const column of dropCols) {
                  const [cols] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
                  if (cols.length) await conn.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
                  else console.warn(`${table}.${column} missing, skip drop`);
                }
              }
              if (/DROP INDEX IF EXISTS/i.test(sql)) {
                const dropIdx = [...sql.matchAll(/DROP INDEX IF EXISTS\s+([`\w]+)/gi)].map((m) =>
                  m[1].replace(/`/g, '')
                );
                for (const index of dropIdx) {
                  const [idxs] = await conn.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [index]);
                  if (idxs.length) await conn.query(`ALTER TABLE ${table} DROP INDEX ${index}`);
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
          if (!/^ALTER TABLE\s+[`\w]+\s*;?$/i.test(cleaned)) {
            await conn.query(cleaned);
          }
          continue;
        }
        await conn.query(sql);
      }
    } finally {
      conn.release();
    }
    console.log('Wallet schema ready');
  } catch (err) {
    console.error('Wallet schema sync failed', err);
  }
})();

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const walletLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

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

const TransferSchema = z.object({
  to_user_id: z.coerce.number().int().positive(),
  asset: z.enum(['BNB', 'ETH', 'USDC', 'USDT']),
  amount: z.string(),
});

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

app.get('/wallet/assets', walletLimiter, async (req, res, next) => {
  try {
    const userId = await requireUser(req);
    const [rows] = await pool.query(
      'SELECT asset, balance_wei FROM user_balances WHERE user_id=?',
      [userId]
    );
    const assets = [];
    for (const row of rows) {
      const sym = (row.asset || '').toUpperCase();
      const meta = tokenMetaBySymbol[sym];
      const decimals = meta ? meta.decimals : 18;
      const contract = meta ? meta.contract : null;
      const rawWei = row.balance_wei?.toString() || '0';
      const wei = rawWei.includes('.') ? rawWei.split('.')[0] : rawWei;
      assets.push({
        symbol: sym,
        display_symbol: sym,
        contract,
        decimals,
        balance_wei: wei,
        balance: formatUnitsStr(wei, decimals),
      });
    }
    res.json({ ok: true, assets });
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
    const plans = rows.map((r) => ({
      id: r.id,
      name: r.name || r.title,
      duration_days: r.duration_days ?? r.duration_months ?? null,
      apr_bps: r.apr_bps ?? r.daily_rate ?? null,
      min_deposit_wei: r.min_deposit_wei ? r.min_deposit_wei.toString() : undefined,
    }));
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
    const amt = parseFloat(amount);
    if (amt <= 0) return next({ status: 400, code: 'BAD_INPUT', message: 'Invalid amount' });
    conn = await pool.getConnection();
    const [[plan]] = await conn.query('SELECT id,duration_days,apr_bps FROM staking_plans WHERE id=? AND is_active=1', [planId]);
    if (!plan) return next({ status: 400, code: 'INVALID_PLAN', message: 'Plan not found' });
    const daily = +(amt * (plan.apr_bps / 10000 / 365)).toFixed(8);
    const [result] = await conn.query(
      'INSERT INTO staking_positions (user_id,plan_id,amount,apr_bps_snapshot,start_date,end_date,daily_reward) VALUES (?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), ?)',
      [userId, plan.id, amt, plan.apr_bps, plan.duration_days, daily]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
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
      'SELECT sp.id, sp.amount, sp.start_date, sp.end_date, sp.daily_reward, sp.accrued_total, sp.status, pl.name FROM staking_positions sp JOIN staking_plans pl ON sp.plan_id=pl.id WHERE sp.user_id=? ORDER BY sp.created_at DESC',
      [userId]
    );
    res.json({ ok: true, positions: rows });
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

