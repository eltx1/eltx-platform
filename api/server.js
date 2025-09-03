const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { z } = require('zod');
const { provisionUserAddress } = require('./src/services/wallet');
require('dotenv').config();

['MASTER_MNEMONIC', 'DATABASE_URL'].forEach((v) => {
  if (!process.env[v]) throw new Error(`${v} is not set`);
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
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

const pool = mysql.createPool(
  process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eltx',
  }
);

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const walletLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const sessionCookie = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  domain: process.env.SESSION_COOKIE_DOMAIN,
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
    const wallet = await provisionUserAddress(conn, u.insertId, CHAIN_ID);
    await conn.commit();
    res.cookie(COOKIE_NAME, token, sessionCookie);
    res.json({ ok: true, wallet });
  } catch (err) {
    if (conn) await conn.rollback();
    if (err instanceof z.ZodError) {
      const missing = err.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => e.path[0]);
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
        const wallet = await provisionUserAddress(pool, userId, CHAIN_ID);
        res.cookie(COOKIE_NAME, token, sessionCookie);
        return res.json({ ok: true, wallet });
      }
    }
    await pool.query('INSERT INTO login_attempts (user_id, ip, success) VALUES (?, ?, 0)', [userId, req.ip]);
    return next({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const missing = err.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => e.path[0]);
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
      'SELECT tx_hash, amount_wei, confirmations, status, created_at FROM wallet_deposits WHERE user_id=? AND chain_id=? ORDER BY created_at DESC LIMIT 50',
      [userId, CHAIN_ID]
    );
    const depositSchema = z.object({
      tx_hash: z.string(),
      amount_wei: z.string(),
      confirmations: z.coerce.number(),
      status: z.enum(['seen', 'confirmed', 'swept', 'orphaned']),
      created_at: z.coerce.date(),
    });
    const deposits = z.array(depositSchema).parse(deps);
    res.json({ ok: true, wallet, deposits });
  } catch (err) {
    next(err);
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on port ${port}`);
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
