import { Pool } from 'mysql2/promise';
import { formatUnits } from 'ethers';
import Decimal from 'decimal.js';
import { getDb } from './db.server';

export type HomeMarketEntry = {
  symbol: string;
  label: string;
  priceUsd: number | null;
  change24h?: number | null;
  source: 'spot' | 'coingecko' | 'cache' | 'fallback' | 'unknown';
  updatedAt: string | null;
};

const CACHE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS home_market_cache (
    asset VARCHAR(16) NOT NULL PRIMARY KEY,
    price_usd DECIMAL(36,18) NOT NULL,
    change_24h DECIMAL(18,2) NULL DEFAULT NULL,
    source VARCHAR(32) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const MARKET_ASSETS = [
  { symbol: 'ELTX', label: 'ELTX', provider: 'internal' as const },
  { symbol: 'BTC', label: 'Bitcoin', provider: 'coingecko' as const, providerId: 'bitcoin' },
  { symbol: 'ETH', label: 'Ethereum', provider: 'coingecko' as const, providerId: 'ethereum' },
  { symbol: 'BNB', label: 'BNB', provider: 'coingecko' as const, providerId: 'binancecoin' },
  { symbol: 'SOL', label: 'Solana', provider: 'coingecko' as const, providerId: 'solana' },
];

const MARKET_CACHE_TTL_MS = 60 * 1000;
let cachedMarkets: HomeMarketEntry[] | null = null;
let cachedMarketsAt = 0;
let pendingMarkets: Promise<HomeMarketEntry[]> | null = null;

async function ensureCacheTable(db: Pool) {
  await db.query(CACHE_TABLE_SQL);
}

async function fetchUserCount(db: Pool): Promise<number> {
  const [rows] = await db.query('SELECT COUNT(*) AS total_users FROM users');
  const countValue = (rows as any[])[0]?.total_users;
  const parsed = Number(countValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchEltxPrice(db: Pool): Promise<number | null> {
  const [rows] = await db.query(
    `SELECT st.price_wei, sm.base_decimals, sm.quote_decimals, st.created_at
     FROM spot_trades st
     JOIN spot_markets sm ON sm.id = st.market_id
     WHERE sm.symbol = 'ELTX/USDC'
     ORDER BY st.id DESC
     LIMIT 1`
  );
  if (!(rows as any[]).length) return null;
  const latest = (rows as any[])[0];
  const priceWei = latest.price_wei?.toString?.() ?? null;
  if (!priceWei) return null;
  const normalized = Number(formatUnits(BigInt(priceWei), 18));
  if (!Number.isFinite(normalized)) return null;
  return normalized;
}

async function readCache(db: Pool): Promise<Record<string, { price: number; change: number | null; updatedAt: string }>> {
  await ensureCacheTable(db);
  const [rows] = await db.query('SELECT asset, price_usd, change_24h, updated_at FROM home_market_cache');
  const map: Record<string, { price: number; change: number | null; updatedAt: string }> = {};
  for (const row of rows as any[]) {
    const price = Number(row.price_usd);
    const change = row.change_24h !== null && row.change_24h !== undefined ? Number(row.change_24h) : null;
    if (!Number.isFinite(price)) continue;
    map[String(row.asset).toUpperCase()] = {
      price,
      change: Number.isFinite(change) ? change : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }
  return map;
}

async function persistCache(
  db: Pool,
  asset: string,
  price: number,
  change24h: number | null,
  source: string
) {
  await ensureCacheTable(db);
  const safePrice = new Decimal(price).toFixed(18);
  const safeChange = change24h !== null && Number.isFinite(change24h) ? new Decimal(change24h).toFixed(2) : null;
  await db.query(
    `INSERT INTO home_market_cache (asset, price_usd, change_24h, source)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE price_usd = VALUES(price_usd), change_24h = VALUES(change_24h), source = VALUES(source)`
      .replace(/\s+/g, ' '),
    [asset.toUpperCase(), safePrice, safeChange, source]
  );
}

async function fetchCoingeckoPrices(): Promise<Record<string, { price: number; change: number | null }>> {
  const ids = MARKET_ASSETS.filter((a) => a.provider === 'coingecko')
    .map((a) => a.providerId)
    .filter(Boolean) as string[];
  if (!ids.length) return {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), 7000);

  try {
    const url = new URL('https://api.coingecko.com/api/v3/simple/price');
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    const res = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`CoinGecko request failed with status ${res.status}`);
    const data = await res.json();
    const mapped: Record<string, { price: number; change: number | null }> = {};
    for (const asset of MARKET_ASSETS) {
      if (asset.provider !== 'coingecko' || !asset.providerId) continue;
      const row = data?.[asset.providerId];
      const price = row?.usd;
      const change = row?.usd_24h_change;
      if (price !== undefined && price !== null && Number.isFinite(Number(price))) {
        mapped[asset.symbol] = {
          price: Number(price),
          change: change !== undefined && change !== null && Number.isFinite(Number(change)) ? Number(change) : null,
        };
      }
    }
    return mapped;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildMarketEntries(): Promise<HomeMarketEntry[]> {
  const db = getDb();
  const now = Date.now();
  if (cachedMarkets && now - cachedMarketsAt < MARKET_CACHE_TTL_MS) return cachedMarkets;
  if (pendingMarkets) return pendingMarkets;

  pendingMarkets = (async () => {
    const cache = await readCache(db);
    const external = await fetchCoingeckoPrices().catch(() => ({}));
    const eltxPrice = await fetchEltxPrice(db).catch(() => null);
    const result: HomeMarketEntry[] = [];

    for (const asset of MARKET_ASSETS) {
      let price: number | null = null;
      let change: number | null | undefined = null;
      let source: HomeMarketEntry['source'] = 'unknown';
      const cacheEntry = cache[asset.symbol];

      if (asset.provider === 'internal') {
        price = eltxPrice;
        change = null;
        source = 'spot';
      } else if (external[asset.symbol]?.price !== undefined) {
        price = external[asset.symbol].price;
        change = external[asset.symbol].change ?? null;
        source = 'coingecko';
      }

      if (price === null || price === undefined || !Number.isFinite(price)) {
        price = cacheEntry?.price ?? null;
        change = cacheEntry?.change ?? null;
        source = price !== null ? 'cache' : 'fallback';
      }

      if (price !== null && Number.isFinite(price)) {
        await persistCache(db, asset.symbol, price, change ?? null, source);
      }

      result.push({
        symbol: asset.symbol,
        label: asset.label,
        priceUsd: price ?? null,
        change24h: change ?? null,
        source,
        updatedAt: cacheEntry?.updatedAt ?? null,
      });
    }

    cachedMarkets = result;
    cachedMarketsAt = Date.now();
    pendingMarkets = null;
    return result;
  })();

  return pendingMarkets;
}

export async function getHomeOverview() {
  try {
    const db = getDb();
    const [userCount, markets] = await Promise.all([
      fetchUserCount(db).catch(() => 0),
      buildMarketEntries().catch(() => []),
    ]);

    return {
      userCount,
      markets,
    };
  } catch (err) {
    console.error('[home] failed to load overview', err);
    return { userCount: 0, markets: [] };
  }
}
