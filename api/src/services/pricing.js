const Decimal = require('decimal.js');

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL_MS = 60 * 1000;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedPrices = null;
let cachedAt = 0;
let cachedIdsKey = '';
let pendingRequest = null;

let cachedConfigs = [];
let cachedConfigMap = new Map();
let cachedConfigAt = 0;

async function fetchCoinGeckoPrices(ids) {
  if (!ids.length) return {};
  const searchParams = new URLSearchParams({
    ids: ids.join(','),
    vs_currencies: 'usd',
  });
  const url = `${COINGECKO_BASE_URL}?${searchParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const error = new Error(`CoinGecko request failed with status ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function getIdsCacheKey(ids) {
  return ids.slice().sort().join(',');
}

async function getUsdPrices(ids) {
  const now = Date.now();
  const key = getIdsCacheKey(ids);
  if (cachedPrices && now - cachedAt < CACHE_TTL_MS && cachedIdsKey === key) return cachedPrices;
  if (pendingRequest && cachedIdsKey === key) return pendingRequest;
  if (!ids.length) return {};

  pendingRequest = (async () => {
    try {
      const result = await fetchCoinGeckoPrices(ids);
      const mapped = {};
      for (const id of ids) {
        const usd = result?.[id]?.usd;
        if (usd !== undefined && usd !== null) mapped[id] = Number(usd);
      }
      cachedPrices = mapped;
      cachedAt = Date.now();
      cachedIdsKey = key;
      return mapped;
    } finally {
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

async function refreshSwapAssetConfigs(db, { force = false } = {}) {
  const now = Date.now();
  if (!force && cachedConfigs.length && now - cachedConfigAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfigs;
  }

  try {
    const [rows] = await db.query(
      `SELECT asset, provider, provider_id, mode, min_amount, max_amount, spread_bps, fallback_price
       FROM swap_assets_config
       WHERE enabled = 1`
    );
    const configs = [];
    const map = new Map();
    for (const row of rows) {
      const symbol = (row.asset || '').toUpperCase();
      if (!symbol) continue;
      const cfg = {
        asset: symbol,
        provider: row.provider || 'coingecko',
        providerId: row.provider_id || null,
        mode: row.mode || 'oracle',
        minAmount: row.min_amount !== undefined && row.min_amount !== null ? row.min_amount.toString() : '0',
        maxAmount: row.max_amount !== undefined && row.max_amount !== null ? row.max_amount.toString() : null,
        spreadBps: Number.isFinite(row.spread_bps) ? Number(row.spread_bps) : 0,
        fallbackPrice:
          row.fallback_price !== undefined && row.fallback_price !== null
            ? row.fallback_price.toString()
            : '0',
      };
      configs.push(cfg);
      map.set(symbol, cfg);
    }
    cachedConfigs = configs;
    cachedConfigMap = map;
    cachedConfigAt = Date.now();
    cachedPrices = null;
    cachedIdsKey = '';
    return configs;
  } catch (err) {
    console.error('[pricing] failed to load swap asset configs', err.message || err);
    if (!cachedConfigs.length) {
      cachedConfigs = [];
      cachedConfigMap = new Map();
      cachedConfigAt = Date.now();
    }
    return cachedConfigs;
  }
}

function getSwapAssetConfig(symbol) {
  if (!symbol) return null;
  return cachedConfigMap.get(symbol.toUpperCase()) || null;
}

function getSwapPricingMode(symbol, { hasPool = false } = {}) {
  const cfg = getSwapAssetConfig(symbol);
  if (!cfg) return 'unsupported';
  if (cfg.mode === 'auto') return hasPool ? 'pool' : 'oracle';
  return cfg.mode;
}

function isSupportedSwapAsset(symbol) {
  return !!getSwapAssetConfig(symbol);
}

function isOraclePricedAsset(symbol, { hasPool = false } = {}) {
  return getSwapPricingMode(symbol, { hasPool }) === 'oracle';
}

function getSupportedSwapAssets() {
  return cachedConfigs.map((cfg) => cfg.asset);
}

async function syncSwapAssetPrices(db, { forceConfig = false } = {}) {
  const configs = await refreshSwapAssetConfigs(db, { force: forceConfig });
  if (!configs.length) return;

  const coingeckoIds = Array.from(
    new Set(configs.filter((cfg) => cfg.provider === 'coingecko' && cfg.providerId).map((cfg) => cfg.providerId))
  );

  const usdPricesById = await getUsdPrices(coingeckoIds).catch((err) => {
    console.error('[pricing] failed to fetch external prices', err.message || err);
    return null;
  });
  const basePrice = Number.parseFloat(process.env.ELTX_PRICE_USD || '1');
  const normalizedBase = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 1;

  for (const cfg of configs) {
    const symbol = cfg.asset;
    let priceEltx = null;
    if (usdPricesById && cfg.provider === 'coingecko' && cfg.providerId) {
      const usd = usdPricesById[cfg.providerId];
      if (usd !== undefined) {
        try {
          priceEltx = new Decimal(usd).div(normalizedBase).toFixed(18, Decimal.ROUND_DOWN);
        } catch (err) {
          console.warn('[pricing] failed to normalize price for', symbol, err.message || err);
        }
      }
    }

    if (!priceEltx && cfg.fallbackPrice && cfg.fallbackPrice !== '0') {
      try {
        priceEltx = new Decimal(cfg.fallbackPrice).toFixed(18, Decimal.ROUND_DOWN);
      } catch (err) {
        console.warn('[pricing] invalid fallback price for', symbol, err.message || err);
        priceEltx = null;
      }
    }

    const minAmount = cfg.minAmount ?? '0';
    const maxAmount = cfg.maxAmount ?? null;
    const spreadBps = Number.isFinite(cfg.spreadBps) ? Number(cfg.spreadBps) : 0;
    const fallbackPrice = cfg.fallbackPrice ?? '0';

    const values = [symbol, priceEltx ?? fallbackPrice, minAmount, maxAmount, spreadBps];
    let sql =
      'INSERT INTO asset_prices (asset, price_eltx, min_amount, max_amount, spread_bps) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ';
    sql += priceEltx !== null ? 'price_eltx = VALUES(price_eltx), ' : 'price_eltx = price_eltx, ';
    sql += 'min_amount = VALUES(min_amount), max_amount = VALUES(max_amount), spread_bps = VALUES(spread_bps)';

    try {
      await db.query(sql, values);
    } catch (err) {
      console.error('[pricing] failed to sync asset price for', symbol, err.message || err);
    }
  }
}

module.exports = {
  getSupportedSwapAssets,
  getSwapAssetConfig,
  getSwapPricingMode,
  isOraclePricedAsset,
  isSupportedSwapAsset,
  syncSwapAssetPrices,
  refreshSwapAssetConfigs,
};
