const Decimal = require('decimal.js');

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL_MS = 60 * 1000;

const SWAP_ASSET_CONFIG = {
  USDT: {
    provider: 'coingecko',
    providerId: 'tether',
    mode: 'pool',
    minAmount: '1',
    maxAmount: null,
    spreadBps: 0,
    fallbackPrice: '1',
  },
  USDC: {
    provider: 'coingecko',
    providerId: 'usd-coin',
    mode: 'pool',
    minAmount: '1',
    maxAmount: null,
    spreadBps: 0,
    fallbackPrice: '1',
  },
  BNB: {
    provider: 'coingecko',
    providerId: 'binancecoin',
    mode: 'oracle',
    minAmount: '0.01',
    maxAmount: null,
    spreadBps: 25,
    fallbackPrice: '0',
  },
  ETH: {
    provider: 'coingecko',
    providerId: 'ethereum',
    mode: 'oracle',
    minAmount: '0.005',
    maxAmount: null,
    spreadBps: 25,
    fallbackPrice: '0',
  },
};

const SUPPORTED_SWAP_ASSETS = Object.keys(SWAP_ASSET_CONFIG);

let cachedPrices = null;
let cachedAt = 0;
let pendingRequest = null;

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

async function getUsdPrices() {
  const now = Date.now();
  if (cachedPrices && now - cachedAt < CACHE_TTL_MS) return cachedPrices;
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const ids = Array.from(
      new Set(
        SUPPORTED_SWAP_ASSETS.map((symbol) => SWAP_ASSET_CONFIG[symbol]?.providerId).filter((id) => !!id)
      )
    );
    try {
      const result = await fetchCoinGeckoPrices(ids);
      const mapped = {};
      for (const symbol of SUPPORTED_SWAP_ASSETS) {
        const cfg = SWAP_ASSET_CONFIG[symbol];
        if (!cfg?.providerId) continue;
        const usd = result?.[cfg.providerId]?.usd;
        if (usd !== undefined && usd !== null) mapped[symbol] = Number(usd);
      }
      cachedPrices = mapped;
      cachedAt = Date.now();
      return mapped;
    } finally {
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

function getSwapAssetConfig(symbol) {
  return SWAP_ASSET_CONFIG[symbol] || null;
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

async function syncSwapAssetPrices(db) {
  const usdPrices = await getUsdPrices().catch((err) => {
    console.error('[pricing] failed to fetch external prices', err.message || err);
    return null;
  });
  const basePrice = Number.parseFloat(process.env.ELTX_PRICE_USD || '1');
  const normalizedBase = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 1;

  for (const symbol of SUPPORTED_SWAP_ASSETS) {
    const cfg = SWAP_ASSET_CONFIG[symbol];
    if (!cfg) continue;

    let priceEltx = null;
    if (usdPrices && usdPrices[symbol] !== undefined) {
      try {
        priceEltx = new Decimal(usdPrices[symbol])
          .div(normalizedBase)
          .toFixed(18, Decimal.ROUND_DOWN);
      } catch (err) {
        console.warn('[pricing] failed to normalize price for', symbol, err.message || err);
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
  SUPPORTED_SWAP_ASSETS,
  SWAP_ASSET_CONFIG,
  getSwapAssetConfig,
  getSwapPricingMode,
  isOraclePricedAsset,
  isSupportedSwapAsset,
  syncSwapAssetPrices,
};
