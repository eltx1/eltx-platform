const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const proxyquire = require('proxyquire');

process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.MASTER_MNEMONIC = process.env.MASTER_MNEMONIC || 'test test test test test test test test test test test junk';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://root@localhost/eltx_test';

const testSchema = {
  users: [{ id: 1, email: 'user@example.com', password_hash: '$argon2id$v=19$m=65536,t=3,p=4$0O4HViXmWtx2WnYIob2P0Q$5h6yA7yrWzXUOqYdW+awh7Y8/4Iv7pGGNqvLFxY2QWo' }],
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
  argon2: { verify: async () => false },
});

const request = supertest(app);

test('POST /auth/login returns 400 for invalid payload', async () => {
  const res = await request.post('/auth/login').send({ email: 'bad' });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'BAD_INPUT');
});

test('GET /wallet/balance blocks unauthenticated requests', async () => {
  const res = await request.get('/wallet/balance');
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});

test('GET /fiat/stripe/rate blocks unauthenticated requests', async () => {
  const res = await request.get('/fiat/stripe/rate');
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});

test('POST /trade/quote blocks unauthenticated requests', async () => {
  const res = await request.post('/trade/quote').send({ from_asset: 'USDT', to_asset: 'ELTX', from_amount: '10' });
  assert.equal(res.status, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHENTICATED');
});


test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});
