import { config as dotenv } from 'dotenv';
import mysql, { Pool } from 'mysql2/promise';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import Decimal from 'decimal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const primaryEnv = '/home/dash/.env';
const localEnv = resolve(__dirname, '.env');
const rootEnv = resolve(__dirname, '../../.env');
dotenv({ path: primaryEnv });
dotenv({ path: localEnv, override: false });
dotenv({ path: rootEnv, override: false });

const API_BASE = process.env.MARKET_MAKER_API_BASE || 'http://localhost:4000';
const PASSWORD = process.env.MARKET_MAKER_PASSWORD;
const FALLBACK_EMAIL = process.env.MARKET_MAKER_EMAIL || process.env.MARKET_MAKER_USER_EMAIL || '';

const SETTINGS_KEYS = [
  'market_maker_enabled',
  'market_maker_spread_bps',
  'market_maker_refresh_minutes',
  'market_maker_user_email',
  'market_maker_pairs',
  'market_maker_target_base_pct',
];

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  WBTC: 'wrapped-bitcoin',
  BNB: 'binancecoin',
};

const levelMultipliers = [0.5, 1, 1.5];

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatAmount(amount: Decimal, precision: number) {
  return amount.toFixed(Math.min(Math.max(0, precision), 18), Decimal.ROUND_DOWN);
}

type PlatformSettings = Record<string, string>;

type MarketMakerSettings = {
  enabled: boolean;
  spreadBps: number;
  refreshMinutes: number;
  userEmail: string;
  pairs: string[];
  targetBasePct: number;
};

type MarketMeta = {
  id: number;
  symbol: string;
  base_asset: string;
  base_decimals: number;
  quote_asset: string;
  quote_decimals: number;
  min_base_amount: string;
  min_quote_amount: string;
  price_precision?: number;
  amount_precision?: number;
};

type WalletAsset = {
  symbol: string;
  balance: string;
  balance_wei: string;
  decimals: number;
};

type OrderbookOrder = {
  id: number;
  status: string;
};

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  pool = mysql.createPool(process.env.DATABASE_URL);
  return pool;
}

async function fetchSettings(): Promise<PlatformSettings> {
  const conn = getPool();
  const [rows] = await conn.query<any[]>(
    `SELECT name, value FROM platform_settings WHERE name IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
    SETTINGS_KEYS
  );
  const map: PlatformSettings = {};
  for (const row of rows) map[row.name] = row.value;
  return map;
}

function buildSettings(raw: PlatformSettings): MarketMakerSettings {
  const spread = Number.parseInt(raw.market_maker_spread_bps || '200', 10);
  const refresh = Number.parseInt(raw.market_maker_refresh_minutes || '30', 10);
  const target = Number.parseInt(raw.market_maker_target_base_pct || '50', 10);
  return {
    enabled: (raw.market_maker_enabled || '0') === '1',
    spreadBps: Number.isFinite(spread) ? spread : 200,
    refreshMinutes: Number.isFinite(refresh) ? refresh : 30,
    userEmail: raw.market_maker_user_email || FALLBACK_EMAIL,
    pairs: (raw.market_maker_pairs || '').split(',').map((p) => p.trim().toUpperCase()).filter(Boolean),
    targetBasePct: Number.isFinite(target) ? target : 50,
  };
}

function log(tag: string, message: string, extra?: Record<string, unknown>) {
  const base = `[maker][${tag}] ${message}`;
  if (extra) console.log(base, JSON.stringify(extra));
  else console.log(base);
}

let sessionCookie = '';
let sessionEmail = '';

async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  if (!res.ok) {
    throw new Error(`login failed (${res.status})`);
  }
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('missing session cookie');
  sessionCookie = setCookie.split(';')[0];
  sessionEmail = email;
  log('AUTH', `logged in as ${email}`);
}

async function authFetch(path: string, options: RequestInit = {}, retries = 1): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (sessionCookie) headers.set('Cookie', sessionCookie);
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && retries > 0) {
    if (!sessionEmail || !PASSWORD) throw new Error('Cannot refresh session without credentials');
    await login(sessionEmail, PASSWORD);
    return authFetch(path, options, retries - 1);
  }
  return res;
}

async function fetchMarkets(): Promise<MarketMeta[]> {
  const res = await authFetch('/spot/markets');
  if (!res.ok) throw new Error(`markets fetch failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json.markets) ? json.markets : [];
}

async function fetchAssets(): Promise<Record<string, WalletAsset>> {
  const res = await authFetch('/wallet/assets');
  if (!res.ok) throw new Error(`assets fetch failed (${res.status})`);
  const json = await res.json();
  const map: Record<string, WalletAsset> = {};
  if (Array.isArray(json.assets)) {
    for (const a of json.assets) {
      map[a.symbol?.toUpperCase()] = a;
    }
  }
  return map;
}

async function fetchOpenOrders(symbol: string): Promise<OrderbookOrder[]> {
  const res = await authFetch(`/spot/orders?market=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`orders fetch failed (${res.status})`);
  const json = await res.json();
  const orders: OrderbookOrder[] = Array.isArray(json.orders) ? json.orders : [];
  return orders.filter((o) => o.status === 'open');
}

async function cancelOrders(orderIds: number[]) {
  for (const id of orderIds) {
    const res = await authFetch(`/spot/orders/${id}/cancel`, { method: 'POST' });
    if (!res.ok) {
      log('CANCEL', `failed to cancel ${id}`, { status: res.status });
    }
  }
}

async function placeOrder(payload: { market: string; side: 'buy' | 'sell'; type: 'limit'; amount: string; price: string }) {
  const res = await authFetch('/spot/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log('ORDER', 'failed', { status: res.status, error: err });
  } else {
    log('ORDER', 'placed', payload);
  }
}

async function fetchPrices(): Promise<Record<string, Decimal>> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usdt`, {
    headers: { 'User-Agent': 'eltx-market-maker' },
  });
  if (!res.ok) throw new Error(`coingecko failed (${res.status})`);
  const json = await res.json();
  const prices: Record<string, Decimal> = {};
  for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
    const val = json[id]?.usdt;
    if (val !== undefined && val !== null) {
      prices[symbol] = new Decimal(val);
    }
  }
  return prices;
}

function pickReferencePrice(pair: string, prices: Record<string, Decimal>): Decimal | null {
  const [base, quote] = pair.split('/');
  if (quote !== 'USDT') return null;
  const price = prices[base];
  return price && price.gt(0) ? price : null;
}

async function cycle(settings: MarketMakerSettings) {
  if (!settings.userEmail) throw new Error('market maker user email missing');
  if (!PASSWORD) throw new Error('MARKET_MAKER_PASSWORD missing');
  if (!settings.pairs.length) throw new Error('no market maker pairs configured');

  if (!sessionCookie || sessionEmail !== settings.userEmail) {
    await login(settings.userEmail, PASSWORD);
  }

  const [markets, assets, prices] = await Promise.all([fetchMarkets(), fetchAssets(), fetchPrices()]);

  for (const pair of settings.pairs) {
    const market = markets.find((m) => m.symbol === pair);
    if (!market) {
      log('SKIP', `market missing for ${pair}`);
      continue;
    }
    const price = pickReferencePrice(pair, prices);
    if (!price || !price.gt(0)) {
      log('SKIP', `price missing for ${pair}`);
      continue;
    }

    const baseBal = new Decimal(assets[market.base_asset]?.balance || '0');
    const quoteBal = new Decimal(assets[market.quote_asset]?.balance || '0');
    const minBase = new Decimal(market.min_base_amount || '0');
    const pricePrecision = market.price_precision ?? 6;
    const amountPrecision = market.amount_precision ?? Math.min(6, market.base_decimals);

    const baseValue = baseBal.mul(price);
    const totalValue = baseValue.plus(quoteBal);
    if (totalValue.lte(0)) {
      log('SKIP', `no balances for ${pair}`);
      continue;
    }
    const targetBaseValue = totalValue.mul(settings.targetBasePct / 100);
    const imbalance = targetBaseValue.minus(baseValue);
    const imbalanceRatio = clamp(imbalance.div(totalValue).toNumber(), -0.5, 0.5);

    const spreadFraction = settings.spreadBps / 10000;
    const buySpreadBias = 1 - 0.5 * imbalanceRatio;
    const sellSpreadBias = 1 + 0.5 * imbalanceRatio;

    const openOrders = await fetchOpenOrders(pair);
    if (openOrders.length) await cancelOrders(openOrders.map((o) => o.id));

    const availableQuote = quoteBal.mul(0.08); // deploy 8% of quote per cycle
    const availableBase = baseBal.mul(0.08);

    for (let i = 0; i < levelMultipliers.length; i += 1) {
      const level = levelMultipliers[i];
      const buySpread = new Decimal(spreadFraction * level * buySpreadBias);
      const sellSpread = new Decimal(spreadFraction * level * sellSpreadBias);

      // Buys
      const buyPrice = price.mul(new Decimal(1).minus(buySpread));
      const perLevelQuote = availableQuote.div(levelMultipliers.length);
      const buyAmount = Decimal.max(minBase, perLevelQuote.div(buyPrice));
      if (buyAmount.gt(0) && buyAmount.lte(quoteBal.div(price))) {
        await placeOrder({
          market: pair,
          side: 'buy',
          type: 'limit',
          amount: formatAmount(buyAmount, amountPrecision),
          price: formatAmount(buyPrice, pricePrecision),
        });
      }

      // Sells
      const sellPrice = price.mul(new Decimal(1).plus(sellSpread));
      const perLevelBase = availableBase.div(levelMultipliers.length);
      const sellAmount = Decimal.max(minBase, perLevelBase);
      if (sellAmount.gt(0) && sellAmount.lte(baseBal)) {
        await placeOrder({
          market: pair,
          side: 'sell',
          type: 'limit',
          amount: formatAmount(sellAmount, amountPrecision),
          price: formatAmount(sellPrice, pricePrecision),
        });
      }
    }
  }
}

async function main() {
  log('START', `api=${API_BASE}`);
  let lastSettings: MarketMakerSettings | null = null;
  while (true) {
    const started = Date.now();
    let delayMinutes = 1;
    try {
      const settings = buildSettings(await fetchSettings());
      lastSettings = settings;
      if (!settings.enabled) {
        log('SKIP', 'market maker disabled');
      } else {
        await cycle(settings);
      }
      delayMinutes = Math.max(1, settings.refreshMinutes);
    } catch (err: any) {
      log('ERROR', err?.message || String(err));
      if (lastSettings) {
        delayMinutes = Math.max(1, lastSettings.refreshMinutes);
      }
    }
    const duration = Date.now() - started;
    const remaining = delayMinutes * 60_000 - duration;
    await sleep(Math.max(5_000, remaining));
  }
}

main().catch((err) => {
  log('FATAL', err?.message || String(err));
  process.exit(1);
});
