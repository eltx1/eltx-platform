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
app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000', 'https://eltx.online'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
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
  sameSite: 'lax',
  secure: false,
  domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
  maxAge: 1000 * 60 * 60,
};

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3),
  language: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

app.post('/auth/signup', async (req, res) => {
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
    const wallet = await provisionUserAddress(conn, u.insertId);
    await conn.commit();
    res.json({ ok: true, wallet });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email or username already exists' });
    }
    res.status(500).json({ message: 'Error creating user' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/auth/login', loginLimiter, async (req, res) => {
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
        await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [
          token,
          userId,
        ]);
        await pool.query('INSERT INTO login_attempts (user_id, ip, success) VALUES (?, ?, 1)', [userId, req.ip]);
        const wallet = await provisionUserAddress(pool, userId);
        res.cookie(COOKIE_NAME, token, sessionCookie);
        return res.json({ ok: true, wallet });
      }
    }
    await pool.query('INSERT INTO login_attempts (user_id, ip, success) VALUES (?, ?, 0)', [userId, req.ip]);
    res.status(401).json({ message: 'Invalid credentials' });
  } catch (err) {
    console.error(err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    res.status(500).json({ message: 'Error logging in' });
  }
});

app.post('/auth/logout', async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    await pool.query('DELETE FROM sessions WHERE id = ?', [token]);
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ message: 'Logged out' });
});

app.get('/auth/me', async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'Not authenticated' });
  try {
    const [rows] = await pool.query(
      'SELECT users.id, users.email FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > NOW()',
      [token]
    );
    if (!rows.length) return res.status(401).json({ message: 'Not authenticated' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/wallet/me', walletLimiter, async (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, message: 'Not authenticated' });
  try {
    const [rows] = await pool.query(
      'SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > NOW()',
      [token]
    );
    if (!rows.length) return res.status(401).json({ ok: false, message: 'Not authenticated' });
    const userId = rows[0].id;
    const chain = process.env.CHAIN || 'bsc-mainnet';
    const wallet = await provisionUserAddress(pool, userId, chain);
    const [deps] = await pool.query(
      'SELECT tx_hash, amount_wei, confirmations, status, created_at FROM wallet_deposits WHERE user_id=? AND chain=? ORDER BY created_at DESC LIMIT 50',
      [userId, chain]
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
    res.status(500).json({ ok: false, message: 'Error' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
