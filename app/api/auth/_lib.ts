import argon2 from 'argon2';
import crypto from 'crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { getDb } from '../../lib/db.server';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const GOOGLE_STATE_COOKIE_NAME = process.env.GOOGLE_AUTH_STATE_COOKIE_NAME || 'goauth_state';
const GOOGLE_BROWSER_COOKIE_NAME = process.env.GOOGLE_AUTH_BROWSER_SESSION_COOKIE_NAME || 'goauth_sid';
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN || (IS_PROD ? '.lordai.net' : undefined);

const SESSION_TTL_SECONDS = Number(process.env.USER_SESSION_TTL_SECONDS || 60 * 60 * 24 * 30);
const GOOGLE_STATE_TTL_SECONDS = Number(process.env.GOOGLE_AUTH_STATE_TTL_SECONDS || 600);

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const GOOGLE_OAUTH_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || '';

export const cookieNames = {
  session: SESSION_COOKIE_NAME,
  googleState: GOOGLE_STATE_COOKIE_NAME,
  googleBrowserSession: GOOGLE_BROWSER_COOKIE_NAME,
};

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: IS_PROD,
  path: '/',
  domain: COOKIE_DOMAIN,
  maxAge: SESSION_TTL_SECONDS,
};

export const googleCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: IS_PROD,
  path: '/',
  domain: COOKIE_DOMAIN,
  maxAge: GOOGLE_STATE_TTL_SECONDS,
};

export const googleBrowserCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: IS_PROD,
  path: '/',
  domain: COOKIE_DOMAIN,
  maxAge: 60 * 60 * 24 * 30,
};

export function hasGoogleOAuthConfig() {
  return Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REDIRECT_URI);
}

export function parseUtm(payload: any) {
  return {
    source: typeof payload?.utm_source === 'string' ? payload.utm_source.slice(0, 191) : null,
    medium: typeof payload?.utm_medium === 'string' ? payload.utm_medium.slice(0, 191) : null,
    campaign: typeof payload?.utm_campaign === 'string' ? payload.utm_campaign.slice(0, 191) : null,
    term: typeof payload?.utm_term === 'string' ? payload.utm_term.slice(0, 191) : null,
    content: typeof payload?.utm_content === 'string' ? payload.utm_content.slice(0, 191) : null,
    landingPath: typeof payload?.utm_landing_path === 'string' ? payload.utm_landing_path.slice(0, 191) : null,
  };
}

export async function writeFirstUtm(conn: PoolConnection, userId: number, utm: ReturnType<typeof parseUtm>) {
  if (!utm.source && !utm.medium && !utm.campaign && !utm.term && !utm.content && !utm.landingPath) return;
  await conn.query(
    `UPDATE users
        SET first_utm_source = COALESCE(first_utm_source, ?),
            first_utm_medium = COALESCE(first_utm_medium, ?),
            first_utm_campaign = COALESCE(first_utm_campaign, ?),
            first_utm_term = COALESCE(first_utm_term, ?),
            first_utm_content = COALESCE(first_utm_content, ?),
            first_utm_landing_path = COALESCE(first_utm_landing_path, ?),
            first_utm_captured_at = COALESCE(first_utm_captured_at, NOW())
      WHERE id = ?`,
    [utm.source, utm.medium, utm.campaign, utm.term, utm.content, utm.landingPath, userId],
  );
}

export async function createSession(userId: number) {
  const token = crypto.randomUUID();
  const db = getDb();
  await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))', [token, userId, SESSION_TTL_SECONDS]);
  return token;
}

export function toPublicUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role || 'user',
    language: row.language || 'en',
    createdAt: row.created_at,
  };
}

function usernameFromEmail(email: string) {
  return email.toLowerCase().split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 28) || 'user';
}

export async function createUserWithPassword(emailRaw: string, password: string, language = 'en', utm = parseUtm({})) {
  const db = getDb();
  const email = emailRaw.trim().toLowerCase();
  const hash = await argon2.hash(password);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const base = usernameFromEmail(email);
    let username = base;
    for (let i = 0; i < 20; i += 1) {
      const [uRows] = await conn.query<RowDataPacket[]>('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
      if (!uRows.length) break;
      username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const [inserted]: any = await conn.query('INSERT INTO users (email, username, language) VALUES (?, ?, ?)', [email, username, language]);
    const userId = Number(inserted.insertId);
    await conn.query('INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)', [userId, hash]);
    await writeFirstUtm(conn, userId, utm);
    await conn.commit();
    return { userId, username, email };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function loginByEmailPassword(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const db = getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.username, u.language, uc.password_hash
       FROM users u
       JOIN user_credentials uc ON uc.user_id = u.id
      WHERE u.email = ?
      LIMIT 1`,
    [email],
  );
  if (!rows.length) return null;
  const row = rows[0] as any;
  const valid = await argon2.verify(row.password_hash, password);
  if (!valid) return null;
  return row;
}

export async function findUserBySession(token: string) {
  const db = getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.username, u.language, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
        AND s.expires_at > NOW()
      LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

export async function consumeGoogleState(state: string, browserSessionId: string) {
  const db = getDb();
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, browser_session_id, redirect_path, return_origin, mode, expires_at, consumed_at
       FROM oauth_google_states
      WHERE state_hash = ?
      LIMIT 1`,
    [stateHash],
  );
  if (!rows.length) return null;
  const row: any = rows[0];
  if (row.consumed_at) return null;
  if (!row.expires_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.browser_session_id && browserSessionId && row.browser_session_id !== browserSessionId) return null;
  await db.query('UPDATE oauth_google_states SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL', [row.id]);
  return row;
}

export async function storeGoogleState(payload: { state: string; browserSessionId: string; redirectPath: string; returnOrigin: string | null; mode: 'login' | 'signup'; userAgent: string; ipAddress: string }) {
  const db = getDb();
  const stateHash = crypto.createHash('sha256').update(payload.state).digest('hex');
  await db.query(
    `INSERT INTO oauth_google_states (state_hash, browser_session_id, redirect_path, return_origin, mode, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [stateHash, payload.browserSessionId, payload.redirectPath, payload.returnOrigin, payload.mode, payload.userAgent || null, payload.ipAddress || null, GOOGLE_STATE_TTL_SECONDS],
  );
}

export async function resolveGoogleUser(code: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
    cache: 'no-store',
  });

  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  if (!tokenData?.access_token) return null;

  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    cache: 'no-store',
  });
  if (!userRes.ok) return null;
  return userRes.json();
}

export async function linkOrCreateGoogleUser(profile: any) {
  const sub = String(profile?.sub || '');
  const email = String(profile?.email || '').toLowerCase();
  if (!sub || !email) return null;
  const db = getDb();
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const [oauthRows] = await conn.query<RowDataPacket[]>('SELECT user_id FROM user_oauth_accounts WHERE provider=? AND provider_sub=? LIMIT 1', ['google', sub]);
    let userId = oauthRows[0]?.user_id ? Number(oauthRows[0].user_id) : null;

    if (!userId) {
      const [userRows] = await conn.query<RowDataPacket[]>('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
      if (userRows.length) {
        userId = Number(userRows[0].id);
      } else {
        const base = usernameFromEmail(email);
        let username = base;
        for (let i = 0; i < 20; i += 1) {
          const [exists] = await conn.query<RowDataPacket[]>('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
          if (!exists.length) break;
          username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
        }
        const [ins]: any = await conn.query('INSERT INTO users (email, username, language) VALUES (?, ?, ?)', [email, username, 'en']);
        userId = Number(ins.insertId);
      }
    }

    await conn.query(
      `INSERT INTO user_oauth_accounts (user_id, provider, provider_sub, email, email_verified, picture_url, last_login_at)
       VALUES (?, 'google', ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), email=VALUES(email), email_verified=VALUES(email_verified), picture_url=VALUES(picture_url), last_login_at=NOW()`,
      [userId, sub, email, profile?.email_verified ? 1 : 0, profile?.picture || null],
    );

    await conn.commit();
    return userId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export const googleConfig = {
  clientId: GOOGLE_OAUTH_CLIENT_ID,
  redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
};
