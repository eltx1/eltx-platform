const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const supertest = require('supertest');
const proxyquire = require('proxyquire');

process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.CHAIN_ID = '56';
process.env.TOKEN_USDT = '0x55d398326f99059fF775485246999027B3197955';
process.env.TOKEN_USDT_DECIMALS = '18';
process.env.MASTER_MNEMONIC = process.env.MASTER_MNEMONIC || 'test test test test test test test test test test test junk';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://root@localhost/eltx_test';
process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || 'test-google-client-secret';
process.env.CONVERT_ALLOW_MOCK = 'true';

const testSchema = {
  users: [{ id: 1, email: 'user@example.com', password_hash: '$argon2id$v=19$m=65536,t=3,p=4$0O4HViXmWtx2WnYIob2P0Q$5h6yA7yrWzXUOqYdW+awh7Y8/4Iv7pGGNqvLFxY2QWo' }, { id: 2, email: 'recipient@example.com', password_hash: '' }],
  sessions: [{ id: 'valid-session', user_id: 1 }],
  premium: { is_premium: 0, premium_expires_at: null },
  balances: { '1:USDT': '1000000' },
  platformFees: { premium_subscription: '0' },
  premiumMonthlyPriceUsdt: '1',
  walletAddresses: {},
  oauthGoogleStates: {},
  oauthAccounts: {},
  convertSettings: {
    convert_execution_mode: 'mock',
    convert_slippage_bps: '120',
    convert_fee_bps: '50',
    convert_min_usdt: '10',
    convert_live_fallback_mock: '1',
  },
  convertPairs: [
    {
      id: 1,
      category: 'crypto',
      symbol: 'BNB/USDT',
      base_asset: 'BNB',
      quote_asset: 'USDT',
      token_symbol: 'BNB',
      token_address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      token_decimals: 18,
      display_name: 'BNB',
      logo_url: null,
      sort_order: 1,
      active: 1,
    },
  ],
  convertExecutions: [],
};

const pool = {
  async query(sql, params = []) {
    if (sql.includes('FROM users JOIN user_credentials')) {
      const email = params[0];
      const user = testSchema.users.find((u) => u.email === email);
      return [user ? [{ id: user.id, password_hash: user.password_hash }] : []];
    }
    if (sql.includes('INSERT INTO login_attempts')) return [{ affectedRows: 1 }];
    if (sql.includes('INSERT INTO sessions')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT id FROM users WHERE email=? LIMIT 1')) {
      const email = params[0];
      const user = testSchema.users.find((u) => u.email === email);
      return [[user ? { id: user.id } : undefined].filter(Boolean)];
    }
    if (sql.includes('SELECT id, language FROM users WHERE email=? LIMIT 1')) {
      const email = params[0];
      const user = testSchema.users.find((u) => u.email === email);
      return [user ? [{ id: user.id, language: 'en' }] : []];
    }
    if (sql.includes('INSERT INTO users (email, username, language) VALUES (?, ?, ?)')) {
      const email = params[0];
      if (testSchema.users.some((u) => u.email === email)) {
        const err = new Error('Duplicate entry');
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      const id = testSchema.users.length + 1;
      testSchema.users.push({ id, email, password_hash: '' });
      return [{ insertId: id }];
    }
    if (sql.includes('INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)')) {
      const user = testSchema.users.find((u) => u.id === Number(params[0]));
      if (user) user.password_hash = String(params[1]);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO referral_codes (user_id, code) VALUES (?, ?)')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT user_id FROM referral_codes WHERE code=? LIMIT 1')) return [[undefined].filter(Boolean)];
    if (sql.includes('INSERT IGNORE INTO referrals (referrer_user_id, referred_user_id) VALUES (?, ?)')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT chain_id, address, wallet_index, wallet_path FROM wallet_addresses WHERE user_id=? AND chain_id=?')) {
      const key = `${params[0]}:${params[1]}`;
      const row = testSchema.walletAddresses[key];
      return [row ? [row] : []];
    }
    if (sql.includes('INSERT INTO wallet_index (chain_id, next_index) VALUES (?, 1) ON DUPLICATE KEY UPDATE next_index=LAST_INSERT_ID(next_index + 1)')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT LAST_INSERT_ID() AS nextIndex')) return [[{ nextIndex: 1 }]];
    if (sql.includes('INSERT INTO wallet_addresses (user_id, chain_id, wallet_index, wallet_path, derivation_index, address) VALUES (?,?,?,?,?,?)')) {
      const [userId, chainId, walletIndex, walletPath, derivationIndex, address] = params;
      testSchema.walletAddresses[`${userId}:${chainId}`] = {
        user_id: userId,
        chain_id: chainId,
        wallet_index: walletIndex,
        wallet_path: walletPath,
        derivation_index: derivationIndex,
        address,
      };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO first_touch_utm')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT users.id FROM sessions JOIN users')) {
      const token = params[0];
      const session = testSchema.sessions.find((s) => s.id === token);
      return [session ? [{ id: session.user_id }] : []];
    }
    if (sql.includes('UPDATE sessions SET expires_at')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT id, is_premium, premium_expires_at FROM users WHERE id=? FOR UPDATE')) {
      const userId = Number(params[0]);
      if (userId !== 1) return [[]];
      return [[{ id: 1, is_premium: testSchema.premium.is_premium, premium_expires_at: testSchema.premium.premium_expires_at }]];
    }
    if (sql.includes("SELECT value FROM platform_settings WHERE name='premium_monthly_price_usdt'")) {
      return [[{ value: testSchema.premiumMonthlyPriceUsdt }]];
    }
    if (sql.includes('SELECT value FROM platform_settings WHERE name=?')) {
      const name = String(params[0] || '');
      if (Object.prototype.hasOwnProperty.call(testSchema.convertSettings, name)) {
        return [[{ value: testSchema.convertSettings[name] }]];
      }
      if (name === 'transfer_fee_bps') return [[{ value: '10' }]];
      return [[{ value: '0' }]];
    }
    if (sql.includes('FROM convert_pairs') && sql.includes('ORDER BY category, sort_order, symbol')) {
      let rows = testSchema.convertPairs.filter((row) => Number(row.active) === 1);
      if (sql.includes('category=?')) rows = rows.filter((row) => row.category === String(params[0]));
      return [rows];
    }
    if (sql.includes('FROM convert_pairs WHERE') && sql.includes('LIMIT 1')) {
      const symbol = String(params[0] || '').toUpperCase();
      const category = sql.includes('category=?') ? String(params[1]) : null;
      const row = testSchema.convertPairs.find(
        (pair) => pair.symbol.toUpperCase() === symbol && Number(pair.active) === 1 && (!category || pair.category === category)
      );
      return [row ? [row] : []];
    }
    if (sql.includes('FROM convert_executions') && sql.includes('idempotency_key=?')) {
      const userId = Number(params[0]);
      const key = String(params[1]);
      const row = testSchema.convertExecutions.find((item) => item.user_id === userId && item.idempotency_key === key);
      return [row ? [row] : []];
    }
    if (sql.includes('SELECT asset, balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      const balance = testSchema.balances[key];
      return [balance ? [{ asset: String(params[1]).toUpperCase(), balance_wei: balance }] : []];
    }
    if (sql.includes('SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? FOR UPDATE')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      const balance = testSchema.balances[key];
      return [balance ? [{ balance_wei: balance }] : []];
    }
    if (sql.includes('SELECT balance_wei FROM user_balances WHERE user_id=? AND UPPER(asset)=? LIMIT 1')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      const balance = testSchema.balances[key];
      return [balance ? [{ balance_wei: balance }] : []];
    }
    if (sql.includes('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND UPPER(asset)=?')) {
      const key = `${Number(params[1])}:${String(params[2]).toUpperCase()}`;
      const current = BigInt(testSchema.balances[key] || '0');
      testSchema.balances[key] = (current - BigInt(params[0])).toString();
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM user_balances WHERE user_id=? AND UPPER(asset)=?')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      delete testSchema.balances[key];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?, ?, ?)')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      testSchema.balances[key] = String(params[2]);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT id FROM users WHERE id=? FOR UPDATE')) {
      const userId = Number(params[0]);
      const user = testSchema.users.find((u) => u.id === userId);
      return [user ? [{ id: userId }] : []];
    }
    if (sql.includes('SELECT balance_wei FROM user_balances WHERE user_id=? AND asset=? FOR UPDATE')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      const balance = testSchema.balances[key];
      return [balance ? [{ balance_wei: balance }] : []];
    }
    if (sql.includes('UPDATE user_balances SET balance_wei = balance_wei - ? WHERE user_id=? AND asset=?')) {
      const key = `${Number(params[1])}:${String(params[2]).toUpperCase()}`;
      const current = BigInt(testSchema.balances[key] || '0');
      testSchema.balances[key] = (current - BigInt(params[0])).toString();
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO user_balances (user_id, asset, balance_wei) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance_wei = balance_wei + VALUES(balance_wei)')) {
      const key = `${Number(params[0])}:${String(params[1]).toUpperCase()}`;
      const current = BigInt(testSchema.balances[key] || '0');
      testSchema.balances[key] = (current + BigInt(params[2])).toString();
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO convert_executions')) {
      const id = testSchema.convertExecutions.length + 1;
      testSchema.convertExecutions.push({
        id,
        user_id: Number(params[0]),
        pair_id: Number(params[1]),
        side: String(params[2]),
        status: String(params[3]),
        amount_wei: String(params[4]),
        quote_without_fee_wei: String(params[6]),
        fee_wei: String(params[8]),
        debit_asset: String(params[9]),
        debit_wei: String(params[10]),
        idempotency_key: params[11] ? String(params[11]) : null,
        tx_hash: null,
        credited_asset: null,
        credited_wei: null,
      });
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE convert_executions SET status=?, tx_hash=?, credited_asset=?, credited_wei=?, metadata=?, updated_at=NOW() WHERE id=?')) {
      const id = Number(params[5]);
      const row = testSchema.convertExecutions.find((item) => item.id === id);
      if (row) {
        row.status = String(params[0]);
        row.tx_hash = String(params[1]);
        row.credited_asset = String(params[2]);
        row.credited_wei = String(params[3]);
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.includes('UPDATE convert_executions SET status=?, fail_reason=?, updated_at=NOW() WHERE id=?')) {
      const id = Number(params[2]);
      const row = testSchema.convertExecutions.find((item) => item.id === id);
      if (row) {
        row.status = String(params[0]);
        row.fail_reason = String(params[1]);
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.includes('INSERT INTO platform_fees (fee_type, reference, asset, amount_wei) VALUES (?,?,?,?)')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO wallet_transfers')) {
      return [{ insertId: 1, affectedRows: 1 }];
    }

    if (sql.includes('UPDATE users SET is_premium=1, premium_expires_at=? WHERE id=?')) {
      testSchema.premium = { is_premium: 1, premium_expires_at: params[0] };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO platform_fee_balances (fee_type, asset, amount_wei)")) {
      const next = BigInt(testSchema.platformFees.premium_subscription) + BigInt(params[0]);
      testSchema.platformFees.premium_subscription = next.toString();
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('DELETE FROM oauth_google_states WHERE browser_session_id=?')) {
      const browserSessionId = String(params[0]);
      for (const key of Object.keys(testSchema.oauthGoogleStates)) {
        if (testSchema.oauthGoogleStates[key].browser_session_id === browserSessionId) delete testSchema.oauthGoogleStates[key];
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO oauth_google_states')) {
      const [stateHash, browserSessionId, redirectPath, returnOrigin, mode] = params;
      testSchema.oauthGoogleStates[String(stateHash)] = {
        id: Object.keys(testSchema.oauthGoogleStates).length + 1,
        state_hash: String(stateHash),
        browser_session_id: String(browserSessionId),
        redirect_path: String(redirectPath),
        return_origin: returnOrigin ? String(returnOrigin) : null,
        mode: String(mode),
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM oauth_google_states') && sql.includes('state_hash=?')) {
      const stateHash = String(params[0]);
      const row = testSchema.oauthGoogleStates[stateHash];
      if (!row) return [[]];
      return [[row]];
    }
    if (sql.includes('UPDATE oauth_google_states') && sql.includes('consumed_at=NOW()')) {
      const rowId = Number(params[1]);
      const row = Object.values(testSchema.oauthGoogleStates).find((entry) => entry.id === rowId);
      if (!row || row.consumed_at) return [{ affectedRows: 0 }];
      row.consumed_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('SELECT user_id FROM user_oauth_accounts WHERE provider=? AND provider_sub=? LIMIT 1')) {
      const providerSub = String(params[1]);
      const row = testSchema.oauthAccounts[providerSub];
      return [row ? [{ user_id: row.user_id }] : []];
    }
    if (sql.includes('INSERT INTO user_oauth_accounts')) {
      const [userId, _provider, providerSub, email, emailVerified, picture] = params;
      testSchema.oauthAccounts[String(providerSub)] = {
        user_id: Number(userId),
        email: String(email),
        email_verified: Number(emailVerified),
        picture_url: picture ? String(picture) : null,
      };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE user_oauth_accounts SET email=?, email_verified=?, picture_url=?, last_login_at=NOW() WHERE provider=? AND provider_sub=?')) {
      const [email, emailVerified, picture, _provider, providerSub] = params;
      const current = testSchema.oauthAccounts[String(providerSub)] || { user_id: 1 };
      testSchema.oauthAccounts[String(providerSub)] = {
        ...current,
        email: String(email),
        email_verified: Number(emailVerified),
        picture_url: picture ? String(picture) : null,
      };
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('FROM sessions JOIN users')) return [[]];
    if (sql.includes('SELECT id, chain_id, address FROM wallets')) return [[{ id: 1, chain_id: 56, address: '0x1234' }]];
    if (sql.includes('INSERT INTO wallets')) return [{ insertId: 1 }];
    return [[]];
  },
  async getConnection() {
    return {
      query: this.query.bind(this),
      release() {},
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
    };
  },
};

const { app, server } = proxyquire('../src/app', {
  './config/database': { createDatabasePool: () => pool },
  argon2: { verify: async () => false, hash: async () => 'hashed-password', argon2id: 2 },
});

const request = supertest(app);

const originalFetch = global.fetch;

global.fetch = async (url) => {
  const asString = String(url);
  if (asString.includes('oauth2.googleapis.com/token')) {
    return {
      ok: true,
      json: async () => ({ access_token: 'test-google-access-token' }),
    };
  }
  if (asString.includes('www.googleapis.com/oauth2/v3/userinfo') || asString.includes('openidconnect.googleapis.com/v1/userinfo')) {
    return {
      ok: true,
      json: async () => ({
        sub: 'google-sub-1',
        email: 'google-user@example.com',
        email_verified: true,
        picture: 'https://example.com/avatar.png',
      }),
    };
  }
  throw new Error(`Unexpected fetch url in tests: ${asString}`);
};

function signState(payload, secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'lordai-google-state') {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

test('POST /auth/login returns 400 for invalid payload', async () => {
  const res = await request.post('/auth/login').send({ email: 'bad' });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'BAD_INPUT');
});

test('POST /auth/signup returns USER_EXISTS when email already exists', async () => {
  const res = await request.post('/auth/signup').send({ email: 'user@example.com', password: 'Password123' });
  assert.equal(res.status, 409);
  assert.equal(res.body?.error?.code, 'USER_EXISTS');
});

test('POST /auth/signup creates a new account successfully', async () => {
  const email = 'new-user@example.com';
  const res = await request.post('/auth/signup').send({ email, password: 'Password123', language: 'en' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(testSchema.users.some((u) => u.email === email), true);
});

test('GET /auth/google/callback does not fail only because cookie state mismatches', async () => {
  const payload = { nonce: 'n-1', ts: Date.now(), mode: 'login', redirect: '/dashboard', returnOrigin: 'https://lordai.net' };
  const state = signState(payload);
  const res = await request
    .get(`/auth/google/callback?state=${encodeURIComponent(state)}`)
    .set('Cookie', 'gstate=other-state-value; goauth_sid=browser-1');

  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'GOOGLE_CODE_MISSING');
});

test('GET /auth/google/start builds Google redirect_uri from the current API host when not configured', async () => {
  const res = await request
    .get('/auth/google/start?mode=login&redirect=/dashboard&return_origin=https://lordai.net')
    .set('Host', 'localhost:4100');

  assert.equal(res.status, 302);
  const location = String(res.headers.location || '');
  const url = new URL(location);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:4100/auth/google/callback');
});

test('GET /auth/google/callback returns GOOGLE_CODE_MISSING when state is valid and stored', async () => {
  const payload = { nonce: 'n-2', ts: Date.now(), mode: 'login', redirect: '/dashboard', returnOrigin: 'https://lordai.net' };
  const state = signState(payload);
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  testSchema.oauthGoogleStates[stateHash] = {
    id: 77,
    state_hash: stateHash,
    browser_session_id: 'browser-2',
    redirect_path: '/dashboard',
    return_origin: 'https://lordai.net',
    mode: 'login',
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  const res = await request
    .get(`/auth/google/callback?state=${encodeURIComponent(state)}`)
    .set('Cookie', `gstate=${encodeURIComponent(state)}; goauth_sid=browser-2`);

  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'GOOGLE_CODE_MISSING');
});

test('GET /wallet/balance blocks unauthenticated requests', async () => {
  const res = await request.get('/wallet/balance');
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});

test('GET /wallet/usdt-balance returns formatted USDT balance for authenticated users', async () => {
  testSchema.balances['1:USDT'] = '1234567';
  const res = await request.get('/wallet/usdt-balance').set('Cookie', 'sid=valid-session');
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.balance_wei, '1234567');
  assert.equal(res.body?.balance, '1.234567');
});

test('GET /wallet/usdt-balance keeps 18-decimal balances unchanged when already normalized', async () => {
  testSchema.balances['1:USDT'] = '1000000000000000000';
  const res = await request.get('/wallet/usdt-balance').set('Cookie', 'sid=valid-session');

  assert.equal(res.status, 200);
  assert.equal(res.body?.decimals, 18);
  assert.equal(res.body?.balance, '1.000000000000000000');
});


test('POST /wallet/transfer allows USDT transfers for authenticated users', async () => {
  testSchema.balances['1:USDT'] = '10000000000000000000';
  testSchema.balances['2:USDT'] = '0';

  const res = await request
    .post('/wallet/transfer')
    .set('Cookie', 'sid=valid-session')
    .send({ to_user_id: 2, asset: 'USDT', amount: '10' });

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(testSchema.balances['1:USDT'], '0');
  assert.equal(testSchema.balances['2:USDT'], '9990000000000000000');
});

test('POST /convert/quote returns mock quote and fee details', async () => {
  testSchema.convertSettings.convert_execution_mode = 'mock';
  const res = await request
    .post('/convert/quote')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amount: '10' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.mode, 'mock');
  assert.equal(res.body?.quote?.quote_without_fee, '6000');
  assert.equal(res.body?.quote?.fee_usdt, '30');
  assert.equal(res.body?.quote?.total_usdt, '6030');
});

test('GET /convert/status returns structured readiness payload', async () => {
  testSchema.convertSettings.convert_execution_mode = 'live';
  testSchema.convertSettings.convert_live_fallback_mock = '0';
  const originalPk = process.env.CONVERT_HOT_WALLET_PK;
  const originalAddress = process.env.CONVERT_HOT_WALLET_ADDRESS;
  const originalRpc = process.env.BSC_RPC_URL;
  delete process.env.CONVERT_HOT_WALLET_PK;
  delete process.env.CONVERT_HOT_WALLET_ADDRESS;
  delete process.env.BSC_RPC_URL;
  const res = await request.get('/convert/status?category=crypto').set('Cookie', 'sid=valid-session');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body?.liveReady, 'boolean');
  assert.equal(Array.isArray(res.body?.missingEnv), true);
  assert.equal(typeof res.body?.pairsCount, 'number');
  process.env.CONVERT_HOT_WALLET_PK = originalPk;
  process.env.CONVERT_HOT_WALLET_ADDRESS = originalAddress;
  process.env.BSC_RPC_URL = originalRpc;
  testSchema.convertSettings.convert_execution_mode = 'mock';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
});

test('POST /convert/quote uses sane mock reference pricing for XAUT/USDT', async () => {
  const xautPair = {
    id: 2,
    category: 'gold',
    symbol: 'XAUT/USDT',
    base_asset: 'XAUT',
    quote_asset: 'USDT',
    token_symbol: 'XAUT',
    token_address: null,
    token_decimals: 18,
    display_name: 'Tether Gold',
    logo_url: null,
    sort_order: 2,
    active: 1,
  };
  testSchema.convertPairs.push(xautPair);
  testSchema.convertSettings.convert_execution_mode = 'mock';
  const res = await request
    .post('/convert/quote')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'gold', symbol: 'XAUT/USDT', side: 'buy', amount: '1' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.mode, 'mock');
  assert.equal(res.body?.quote?.quote_without_fee, '3300');
  assert.equal(res.body?.quote?.total_usdt, '3316.5');
  testSchema.convertPairs.pop();
});

test('POST /convert/execute performs debit/credit lifecycle in mock mode', async () => {
  testSchema.convertExecutions.length = 0;
  testSchema.convertSettings.convert_execution_mode = 'mock';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
  testSchema.balances['1:USDT'] = '11000000000000000000000';
  testSchema.balances['1:BNB'] = '0';

  const res = await request
    .post('/convert/execute')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amountType: 'quote', amountUsdt: '10', idempotency_key: 'exec-smoke-0001' });

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(testSchema.convertExecutions.length, 1);
  assert.equal(testSchema.convertExecutions[0].status, 'confirmed');
  assert.equal(testSchema.balances['1:USDT'], '10990000000000000000000');
  assert.equal(testSchema.balances['1:BNB'], '10000000000000000000');
});


test('POST /convert/execute buy accepts amountUsdt payload and avoids INVALID_AMOUNT', async () => {
  testSchema.convertSettings.convert_execution_mode = 'mock';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
  const res = await request
    .post('/convert/execute')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amountType: 'quote', amountUsdt: '5', idempotency_key: 'exec-buy-usdt-1' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
});

test('POST /convert/execute returns replay response for same idempotency key', async () => {
  const res = await request
    .post('/convert/execute')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amountType: 'quote', amountUsdt: '10', idempotency_key: 'exec-smoke-0001' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.idempotent_replay, true);
});

test('POST /convert/execute validates idempotency key header before database insert', async () => {
  const tooLongKey = 'k'.repeat(129);
  const beforeCount = testSchema.convertExecutions.length;
  const res = await request
    .post('/convert/execute')
    .set('Cookie', 'sid=valid-session')
    .set('idempotency-key', tooLongKey)
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amount: '1' });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'BAD_INPUT');
  assert.equal(testSchema.convertExecutions.length, beforeCount);
});

test('POST /convert/execute blocks live mode when wallet env is missing and fallback disabled', async () => {
  testSchema.convertSettings.convert_execution_mode = 'live';
  testSchema.convertSettings.convert_live_fallback_mock = '0';
  const res = await request
    .post('/convert/execute')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amountType: 'quote', amountUsdt: '1', idempotency_key: 'exec-live-missing-1' });
  assert.equal(res.status, 503);
  assert.equal(res.body?.error?.code, 'CONVERT_LIVE_NOT_READY');
  testSchema.convertSettings.convert_execution_mode = 'mock';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
});

test('POST /convert/quote returns runtime warning when live is misconfigured but fallback is enabled', async () => {
  testSchema.convertSettings.convert_execution_mode = 'live';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
  const originalPk = process.env.CONVERT_HOT_WALLET_PK;
  const originalAddress = process.env.CONVERT_HOT_WALLET_ADDRESS;
  const originalRpc = process.env.BSC_RPC_URL;
  delete process.env.CONVERT_HOT_WALLET_PK;
  delete process.env.CONVERT_HOT_WALLET_ADDRESS;
  delete process.env.BSC_RPC_URL;
  const res = await request
    .post('/convert/quote')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'crypto', symbol: 'BNB/USDT', side: 'buy', amount: '1' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.mode, 'mock');
  assert.ok(res.body?.runtime_warning);
  process.env.CONVERT_HOT_WALLET_PK = originalPk;
  process.env.CONVERT_HOT_WALLET_ADDRESS = originalAddress;
  process.env.BSC_RPC_URL = originalRpc;
  testSchema.convertSettings.convert_execution_mode = 'mock';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
});
test('POST /convert/quote returns PAIR_NOT_LIVE_READY when live is enabled and pair has no address mapping', async () => {
  const xautPair = {
    id: 3,
    category: 'gold',
    symbol: 'XAUT/USDT',
    base_asset: 'XAUT',
    quote_asset: 'USDT',
    token_symbol: 'XAUT',
    token_address: null,
    token_decimals: 18,
    display_name: 'Tether Gold',
    logo_url: null,
    sort_order: 3,
    active: 1,
  };
  testSchema.convertPairs.push(xautPair);
  testSchema.convertSettings.convert_execution_mode = 'live';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
  testSchema.convertSettings.convert_require_pair_address_live = '1';
  process.env.BSC_RPC_URL = 'https://bsc-dataseed.binance.org';
  process.env.CONVERT_HOT_WALLET_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  process.env.CONVERT_HOT_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const res = await request
    .post('/convert/quote')
    .set('Cookie', 'sid=valid-session')
    .send({ category: 'gold', symbol: 'XAUT/USDT', side: 'buy', amount: '1' });
  assert.equal(res.status, 503);
  assert.equal(res.body?.error?.code, 'PAIR_NOT_LIVE_READY');
  testSchema.convertPairs.pop();
  testSchema.convertSettings.convert_execution_mode = 'mock';
  testSchema.convertSettings.convert_live_fallback_mock = '1';
});
test('GET /fiat/stripe/rate blocks unauthenticated requests', async () => {
  const res = await request.get('/fiat/stripe/rate');
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});


test('POST /auth/delete-account blocks unauthenticated requests', async () => {
  const res = await request.post('/auth/delete-account').send({ password: 'password123' });
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});

test('POST /trade/quote blocks unauthenticated requests', async () => {
  const res = await request.post('/trade/quote').send({ from_asset: 'USDT', to_asset: 'ELTX', from_amount: '10' });
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});

test('POST /premium/subscribe charges USDT using token decimals', async () => {
  testSchema.balances['1:USDT'] = '1000000';
  testSchema.platformFees.premium_subscription = '0';
  testSchema.premiumMonthlyPriceUsdt = '1';
  testSchema.premium = { is_premium: 0, premium_expires_at: null };

  const res = await request.post('/premium/subscribe').set('Cookie', 'sid=valid-session').send({ months: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.charged?.amount_wei, '1000000');
  assert.equal(testSchema.balances['1:USDT'], '0');
  assert.equal(testSchema.platformFees.premium_subscription, '1000000');
});

test('POST /premium/subscribe handles fractional USDT totals without float artifacts', async () => {
  testSchema.balances['1:USDT'] = '3000000';
  testSchema.platformFees.premium_subscription = '0';
  testSchema.premiumMonthlyPriceUsdt = '0.99';
  testSchema.premium = { is_premium: 0, premium_expires_at: null };

  const res = await request.post('/premium/subscribe').set('Cookie', 'sid=valid-session').send({ months: 3 });
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.charged?.amount_wei, '2970000');
  assert.equal(testSchema.balances['1:USDT'], '30000');
  assert.equal(testSchema.platformFees.premium_subscription, '2970000');
});


test.after(async () => {
  global.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
});


test('GET /auth/google/callback accepts missing gstate cookie when state is valid and stored', async () => {
  const payload = { nonce: 'n-3', ts: Date.now(), mode: 'login', redirect: '/dashboard', returnOrigin: 'https://lordai.net' };
  const state = signState(payload);
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  testSchema.oauthGoogleStates[stateHash] = {
    id: 78,
    state_hash: stateHash,
    browser_session_id: 'browser-3',
    redirect_path: '/dashboard',
    return_origin: 'https://lordai.net',
    mode: 'login',
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  const res = await request
    .get(`/auth/google/callback?state=${encodeURIComponent(state)}`)
    .set('Cookie', 'goauth_sid=browser-3');

  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'GOOGLE_CODE_MISSING');
});

test('GET /auth/google/callback creates a session when state is missing but code is present', async () => {
  const res = await request
    .get('/auth/google/callback?code=test-google-code')
    .set('Cookie', 'goauth_sid=browser-missing-state');

  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ''), /\/dashboard$/);
  const setCookie = res.headers['set-cookie'] || [];
  assert.equal(setCookie.some((value) => String(value).startsWith('sid=')), true);
});

test('GET /auth/google/callback creates a session when state signature is invalid but code is present', async () => {
  const res = await request
    .get('/auth/google/callback?state=bad-state-signature&code=test-google-code')
    .set('Cookie', 'gstate=bad-state-signature; goauth_sid=browser-invalid-state');

  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ''), /\/dashboard$/);
  const setCookie = res.headers['set-cookie'] || [];
  assert.equal(setCookie.some((value) => String(value).startsWith('sid=')), true);
});

test('POST /auth/logout clears oauth browser session cookie', async () => {
  const res = await request.post('/auth/logout').set('Cookie', 'sid=valid-session; goauth_sid=browser-1');
  assert.equal(res.status, 200);
  const setCookie = res.headers['set-cookie'] || [];
  assert.equal(setCookie.some((value) => String(value).startsWith('goauth_sid=;')), true);
});
