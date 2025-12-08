'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { apiFetch } from '../../../lib/api';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import SpotMarketChart from '../../../../components/trade/SpotMarketChart';
import { getDefaultSpotSlippageBps, subscribeSpotSlippage } from '../../../lib/settings';

type SpotMarket = {
  id: number;
  symbol: string;
  base_asset: string;
  base_decimals: number;
  quote_asset: string;
  quote_decimals: number;
  min_base_amount: string;
  min_quote_amount: string;
  last_price: string | null;
  price_precision?: number;
  amount_precision?: number;
  min_price?: string | null;
  max_price?: string | null;
  price_min?: string | null;
  price_max?: string | null;
};

type MarketsResponse = {
  markets: SpotMarket[];
  fees?: { maker_bps?: number | null; taker_bps?: number | null };
};

type SpotFees = { maker: number; taker: number };

type OrderbookLevel = {
  price: string;
  price_wei: string;
  base_amount: string;
  base_amount_wei: string;
  quote_amount: string;
  quote_amount_wei: string;
};

type OrderbookResponse = {
  market: { symbol: string; base_asset: string; quote_asset: string };
  orderbook: { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
  trades: Array<{
    id: number;
    price: string;
    price_wei: string;
    base_amount: string;
    base_amount_wei: string;
    quote_amount: string;
    quote_amount_wei: string;
    taker_side: string;
    created_at: string;
  }>;
};

type SpotOrder = {
  id: number;
  market: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  status: 'open' | 'filled' | 'cancelled';
  price: string | null;
  price_wei: string;
  base_amount: string;
  base_amount_wei: string;
  remaining_base_amount: string;
  remaining_base_wei: string;
  quote_amount: string;
  quote_amount_wei: string;
  remaining_quote_amount: string;
  remaining_quote_wei: string;
  fee_bps: number;
  created_at: string;
  updated_at: string;
};

type PlaceOrderResponse = {
  order: {
    id: number;
    status: string;
    remaining_base_wei: string;
    remaining_quote_wei: string;
    filled_base_wei: string;
    filled_base: string;
    average_price: string | null;
  };
  trades: Array<{
    trade_id: number;
    maker_order_id: number;
    price: string;
    price_wei: string;
    base_amount: string;
    base_amount_wei: string;
    quote_amount: string;
    quote_amount_wei: string;
    taker_fee_wei: string;
    maker_fee_wei: string;
  }>;
};

type WalletAsset = {
  symbol: string;
  balance: string;
  balance_wei: string;
  decimals: number;
};

type WalletAssetsResponse = {
  assets: WalletAsset[];
};

type ValidationState = { valid: boolean; message: string | null };

const ZERO = new Decimal(0);
const MARKET_PRIORITY = ['ELTX/USDC', 'ELTX/USDT', 'ELTX/BNB', 'ELTX/ETH'];

function trimDecimal(value: string): string {
  if (!value) return '0';
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return normalized.length ? normalized : '0';
}

function safeDecimal(value: string | number | null | undefined): Decimal {
  try {
    if (value === null || value === undefined) return ZERO;
    const normalized = typeof value === 'string' && value.trim() === '' ? '0' : value;
    return new Decimal(normalized as Decimal.Value);
  } catch {
    return ZERO;
  }
}

function formatWithPrecision(value: Decimal, precision: number): string {
  const places = Math.min(Math.max(0, precision), 8);
  return trimDecimal(value.toFixed(places, Decimal.ROUND_DOWN));
}

function sortMarkets(markets: SpotMarket[]): SpotMarket[] {
  const prioritize = (symbol: string) =>
    MARKET_PRIORITY.includes(symbol) ? MARKET_PRIORITY.indexOf(symbol) : Number.MAX_SAFE_INTEGER;
  return [...markets].sort((a, b) => {
    const rankA = prioritize(a.symbol);
    const rankB = prioritize(b.symbol);
    if (rankA !== rankB) return rankA - rankB;
    return a.symbol.localeCompare(b.symbol);
  });
}

function exceedsPrecision(raw: string, precision?: number | null): boolean {
  if (precision === undefined || precision === null) return false;
  const normalized = raw.trim();
  if (!normalized.includes('.')) return false;
  const decimals = normalized.split('.')[1]?.replace(/0+$/, '') ?? '';
  return decimals.length > precision;
}

type MarketFill = {
  filled: Decimal;
  totalQuote: Decimal;
  average: Decimal | null;
  hasLiquidity: boolean;
};

function computeMarketFill(levels: OrderbookLevel[], desired: Decimal): MarketFill {
  if (desired.lte(0)) return { filled: ZERO, totalQuote: ZERO, average: null, hasLiquidity: false };
  let remaining = desired;
  let filled = ZERO;
  let totalQuote = ZERO;
  for (const level of levels) {
    const levelBase = safeDecimal(level.base_amount);
    const price = safeDecimal(level.price);
    if (levelBase.lte(0) || price.lte(0)) continue;
    const take = Decimal.min(remaining, levelBase);
    if (take.lte(0)) continue;
    filled = filled.plus(take);
    totalQuote = totalQuote.plus(take.mul(price));
    remaining = remaining.minus(take);
    if (remaining.lte(0)) break;
  }
  const average = filled.gt(0) ? totalQuote.div(filled) : null;
  return { filled, totalQuote, average, hasLiquidity: remaining.lte(0) };
}

export default function SpotTradePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [markets, setMarkets] = useState<SpotMarket[]>([]);
  const [fees, setFees] = useState<SpotFees>({ maker: 0, taker: 0 });
  const [selectedMarket, setSelectedMarket] = useState('');
  const [orderbook, setOrderbook] = useState<{ bids: OrderbookLevel[]; asks: OrderbookLevel[] }>({ bids: [], asks: [] });
  const [trades, setTrades] = useState<OrderbookResponse['trades']>([]);
  const [orders, setOrders] = useState<SpotOrder[]>([]);
  const [balances, setBalances] = useState<Record<string, WalletAsset>>({});
  const [streamConnected, setStreamConnected] = useState(false);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [formSide, setFormSide] = useState<'buy' | 'sell'>('buy');
  const [formType, setFormType] = useState<'limit' | 'market'>('limit');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [slippageBps, setSlippageBps] = useState(getDefaultSpotSlippageBps());
  const [lastBalanceError, setLastBalanceError] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const lastStatusesRef = useRef<Map<number, SpotOrder['status']>>(new Map());
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const loadMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    const res = await apiFetch<MarketsResponse>('/spot/markets');
    setLoadingMarkets(false);
    if (!res.ok) {
      setErrorBanner(res.error || t.common.genericError);
      return;
    }
    setErrorBanner('');
    setMarkets(sortMarkets(res.data.markets));
    const makerBps = res.data.fees?.maker_bps ?? 0;
    const takerBps = res.data.fees?.taker_bps ?? makerBps;
    setFees({ maker: Number.isFinite(makerBps) ? makerBps : 0, taker: Number.isFinite(takerBps) ? takerBps : 0 });
  }, [t.common.genericError]);

  const loadOrderbook = useCallback(
    async (marketSymbol: string, options: { suppressError?: boolean } = {}) => {
      if (!marketSymbol) return;
      setLoadingBook(true);
      const params = new URLSearchParams({ market: marketSymbol });
      const res = await apiFetch<OrderbookResponse>(`/spot/orderbook?${params.toString()}`);
      setLoadingBook(false);
      if (!res.ok) {
        if (!options.suppressError) setErrorBanner(res.error || t.common.genericError);
        return;
      }
      setErrorBanner('');
      setOrderbook(res.data.orderbook);
      setTrades(res.data.trades.slice(0, 20));
    },
    [t.common.genericError]
  );

  const loadOrders = useCallback(
    async (marketSymbol: string, options: { suppressError?: boolean } = {}) => {
      if (!marketSymbol) return;
      const params = new URLSearchParams({ market: marketSymbol });
      const res = await apiFetch<{ orders: SpotOrder[]; trades: any[] }>(`/spot/orders?${params.toString()}`);
      if (!res.ok) {
        if (!options.suppressError) setErrorBanner(res.error || t.common.genericError);
        return;
      }
      setErrorBanner('');
      setOrders(res.data.orders);
      const statusMap = lastStatusesRef.current;
      const seen = new Set<number>();
      res.data.orders.forEach((order) => {
        seen.add(order.id);
        const previous = statusMap.get(order.id);
        if (previous && previous !== order.status && order.status === 'filled') {
          toast({ message: t.spotTrade.notifications.filled, variant: 'success' });
        }
        statusMap.set(order.id, order.status);
      });
      Array.from(statusMap.keys()).forEach((id) => {
        if (!seen.has(id)) statusMap.delete(id);
      });
    },
    [t.common.genericError, t.spotTrade.notifications.filled, toast]
  );

  const loadBalances = useCallback(async (options: { suppressError?: boolean } = {}) => {
    const res = await apiFetch<WalletAssetsResponse>('/wallet/assets');
    if (!res.ok) {
      const message = `${res.error || t.common.genericError}${res.data ? ` (${(res.data as any)?.error?.code || ''})` : ''}`.trim();
      if (!options.suppressError) setErrorBanner(message);
      setLastBalanceError(message);
      return;
    }
    setErrorBanner('');
    if (lastBalanceError) setLastBalanceError(null);
    const map: Record<string, WalletAsset> = {};
    res.data.assets.forEach((asset) => {
      map[(asset.symbol || '').toUpperCase()] = asset;
    });
    setBalances(map);
  }, [lastBalanceError, t.common.genericError]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    if (!markets.length) return;
    setSelectedMarket((prev) => {
      if (prev && markets.some((m) => m.symbol === prev)) return prev;
      return markets[0].symbol;
    });
  }, [markets]);

  useEffect(() => {
    if (!selectedMarket) return;
    loadOrderbook(selectedMarket);
    loadOrders(selectedMarket);
    loadBalances();
  }, [selectedMarket, loadOrderbook, loadOrders, loadBalances]);

  useEffect(() => {
    if (!selectedMarket || streamConnected) return;
    const interval = window.setInterval(() => {
      loadOrderbook(selectedMarket, { suppressError: true });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [selectedMarket, loadOrderbook, streamConnected]);

  useEffect(() => {
    if (!selectedMarket || streamConnected) return;
    const interval = window.setInterval(() => {
      loadOrders(selectedMarket, { suppressError: true });
      loadBalances({ suppressError: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedMarket, loadOrders, loadBalances, streamConnected]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedMarket) return;
    const base = process.env.NEXT_PUBLIC_API_BASE;
    if (!base) return;
    const url = `${base}/spot/stream?market=${encodeURIComponent(selectedMarket)}`;
    const source = new EventSource(url, { withCredentials: true });
    setStreamConnected(false);
    source.addEventListener('update', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        if (payload.orderbook) setOrderbook(payload.orderbook);
        if (payload.trades) setTrades(payload.trades);
        if (payload.orders) setOrders(payload.orders);
        if (payload.balances) setBalances(payload.balances);
        if (payload.fees)
          setFees({ maker: Number(payload.fees.maker_bps || 0), taker: Number(payload.fees.taker_bps || 0) });
        setErrorBanner('');
        setStreamConnected(true);
      } catch (err) {
        console.error('Failed to parse spot stream payload', err);
      }
    });
    source.addEventListener('ping', () => setStreamConnected(true));
    source.addEventListener('error', () => {
      setStreamConnected(false);
      source.close();
    });
    return () => {
      setStreamConnected(false);
      source.close();
    };
  }, [selectedMarket]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsubscribe = subscribeSpotSlippage((value) => setSlippageBps(value));
    return unsubscribe;
  }, []);

  const selectedMarketMeta = useMemo(() => markets.find((m) => m.symbol === selectedMarket) || null, [markets, selectedMarket]);

  const baseSymbol = selectedMarketMeta?.base_asset || null;
  const quoteSymbol = selectedMarketMeta?.quote_asset || null;
  const baseDecimals = selectedMarketMeta?.base_decimals ?? 18;
  const quoteDecimals = selectedMarketMeta?.quote_decimals ?? 18;
  const amountPrecision = selectedMarketMeta?.amount_precision ?? baseDecimals;
  const pricePrecision = selectedMarketMeta?.price_precision ?? 18;

  const baseBalance = baseSymbol ? balances[baseSymbol.toUpperCase()] : undefined;
  const quoteBalance = quoteSymbol ? balances[quoteSymbol.toUpperCase()] : undefined;

  const availableBase = useMemo(() => safeDecimal(baseBalance?.balance), [baseBalance?.balance]);
  const availableQuote = useMemo(() => safeDecimal(quoteBalance?.balance), [quoteBalance?.balance]);

  const lockedBase = useMemo(() => {
    if (!orders.length) return ZERO;
    return orders.reduce((acc, order) => {
      if (order.status !== 'open' || order.side !== 'sell') return acc;
      return acc.plus(safeDecimal(order.remaining_base_amount));
    }, ZERO);
  }, [orders]);

  const lockedQuote = useMemo(() => {
    if (!orders.length) return ZERO;
    return orders.reduce((acc, order) => {
      if (order.status !== 'open' || order.side !== 'buy') return acc;
      return acc.plus(safeDecimal(order.remaining_quote_amount));
    }, ZERO);
  }, [orders]);

  const bestAskDecimal = useMemo(() => (orderbook.asks.length ? safeDecimal(orderbook.asks[0].price) : null), [orderbook.asks]);
  const bestBidDecimal = useMemo(() => (orderbook.bids.length ? safeDecimal(orderbook.bids[0].price) : null), [orderbook.bids]);

  const slippageFraction = useMemo(() => new Decimal(slippageBps || 0).div(10000), [slippageBps]);
  const slippagePercentLabel = useMemo(() => trimDecimal(new Decimal(slippageBps || 0).div(100).toFixed(2)), [slippageBps]);

  const amountDecimal = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      return new Decimal(amount.trim());
    } catch {
      return null;
    }
  }, [amount]);

  const priceDecimal = useMemo(() => {
    if (!price.trim()) return null;
    try {
      return new Decimal(price.trim());
    } catch {
      return null;
    }
  }, [price]);

  const marketEstimation = useMemo<MarketFill | null>(() => {
    if (formType !== 'market' || !amountDecimal || amountDecimal.lte(0)) return null;
    const levels = formSide === 'buy' ? orderbook.asks : orderbook.bids;
    if (!levels.length) return { filled: ZERO, totalQuote: ZERO, average: null, hasLiquidity: false };
    return computeMarketFill(levels, amountDecimal);
  }, [formType, formSide, amountDecimal, orderbook.asks, orderbook.bids]);

  const makerFeeRate = useMemo(() => new Decimal(fees.maker || 0).div(10000), [fees.maker]);
  const takerFeeRate = useMemo(() => new Decimal(fees.taker || 0).div(10000), [fees.taker]);

  const totalForDisplay = useMemo(() => {
    if (!amountDecimal || amountDecimal.lte(0)) return null;
    if (formType === 'limit') {
      if (!priceDecimal || priceDecimal.lte(0)) return null;
      return amountDecimal.mul(priceDecimal);
    }
    if (!marketEstimation || !marketEstimation.hasLiquidity) return null;
    return marketEstimation.totalQuote;
  }, [amountDecimal, formType, priceDecimal, marketEstimation]);

  const estimatedFeeValue = useMemo(() => {
    if (!totalForDisplay) return null;
    const rate = formType === 'market' ? takerFeeRate : makerFeeRate;
    return totalForDisplay.mul(rate);
  }, [totalForDisplay, formType, takerFeeRate, makerFeeRate]);

  const validation = useMemo<ValidationState>(() => {
    if (!selectedMarketMeta) return { valid: false, message: null };
    if (!amount.trim()) return { valid: false, message: t.spotTrade.errors.amountRequired };
    if (!amountDecimal || !amountDecimal.isFinite() || amountDecimal.lte(0))
      return { valid: false, message: t.spotTrade.errors.invalidAmount };
    if (exceedsPrecision(amount.trim(), amountPrecision))
      return { valid: false, message: t.spotTrade.errors.invalidStep };

    const minBase = safeDecimal(selectedMarketMeta.min_base_amount);
    if (minBase.gt(0) && amountDecimal.lt(minBase))
      return { valid: false, message: `${t.spotTrade.errors.amountTooSmall} (${trimDecimal(minBase.toString())})` };

    if (formSide === 'sell' && availableBase.lt(amountDecimal))
      return { valid: false, message: t.spotTrade.errors.insufficientBalance };

    if (formType === 'limit') {
      if (!price.trim()) return { valid: false, message: t.spotTrade.errors.priceRequired };
      if (!priceDecimal || !priceDecimal.isFinite() || priceDecimal.lte(0))
        return { valid: false, message: t.spotTrade.errors.invalidPrice };
      if (exceedsPrecision(price.trim(), pricePrecision))
        return { valid: false, message: t.spotTrade.errors.invalidStep };

      const minPriceRaw = selectedMarketMeta.min_price ?? selectedMarketMeta.price_min;
      const maxPriceRaw = selectedMarketMeta.max_price ?? selectedMarketMeta.price_max;
      if (minPriceRaw) {
        const minPrice = safeDecimal(minPriceRaw);
        if (minPrice.gt(0) && priceDecimal.lt(minPrice))
          return { valid: false, message: t.spotTrade.errors.priceOutOfRange };
      }
      if (maxPriceRaw) {
        const maxPrice = safeDecimal(maxPriceRaw);
        if (maxPrice.gt(0) && priceDecimal.gt(maxPrice))
          return { valid: false, message: t.spotTrade.errors.priceOutOfRange };
      }

      const total = priceDecimal.mul(amountDecimal);
      if (formSide === 'buy') {
        const required = total.plus(total.mul(makerFeeRate));
        if (availableQuote.lt(required))
          return { valid: false, message: t.spotTrade.errors.insufficientBalance };
      }
    } else {
      if (!marketEstimation || !marketEstimation.hasLiquidity || marketEstimation.filled.lt(amountDecimal))
        return { valid: false, message: t.spotTrade.errors.insufficientLiquidity };
      if (formSide === 'buy') {
        if (availableQuote.lt(marketEstimation.totalQuote))
          return { valid: false, message: t.spotTrade.errors.insufficientBalance };
        if (bestAskDecimal && marketEstimation.average) {
          const allowed = bestAskDecimal.mul(new Decimal(1).plus(slippageFraction));
          if (marketEstimation.average.gt(allowed))
            return { valid: false, message: t.spotTrade.errors.slippageExceeded };
        }
      } else {
        if (availableBase.lt(amountDecimal))
          return { valid: false, message: t.spotTrade.errors.insufficientBalance };
        if (bestBidDecimal && marketEstimation.average) {
          const allowed = bestBidDecimal.mul(new Decimal(1).minus(slippageFraction));
          if (allowed.gt(0) && marketEstimation.average.lt(allowed))
            return { valid: false, message: t.spotTrade.errors.slippageExceeded };
        }
      }
    }

    return { valid: true, message: null };
  }, [
    amount,
    amountDecimal,
    amountPrecision,
    availableBase,
    availableQuote,
    bestAskDecimal,
    bestBidDecimal,
    formSide,
    formType,
    makerFeeRate,
    marketEstimation,
    price,
    priceDecimal,
    pricePrecision,
    selectedMarketMeta,
    slippageFraction,
    t.spotTrade.errors,
  ]);

  const mapSpotOrderError = useCallback(
    (code?: string, fallback?: string) => {
      if (!code) return fallback || t.spotTrade.errors.failed;
      switch (code) {
        case 'MARKET_NOT_FOUND':
          return t.spotTrade.errors.marketNotFound;
        case 'PRICE_REQUIRED':
          return t.spotTrade.errors.priceRequired;
        case 'INVALID_AMOUNT':
          return t.spotTrade.errors.invalidAmount;
        case 'INVALID_PRICE':
          return t.spotTrade.errors.invalidPrice;
        case 'AMOUNT_TOO_SMALL':
          return t.spotTrade.errors.amountTooSmall;
        case 'INSUFFICIENT_BALANCE':
          return t.spotTrade.errors.insufficientBalance;
        case 'INSUFFICIENT_LIQUIDITY':
        case 'NO_LIQUIDITY':
          return t.spotTrade.errors.insufficientLiquidity;
        case 'SLIPPAGE_EXCEEDED':
          return t.spotTrade.errors.slippageExceeded;
        case 'PRICE_DEVIATION_EXCEEDED':
          return t.spotTrade.errors.priceDeviationExceeded;
        case 'FOK_INCOMPLETE':
          return t.spotTrade.errors.fokIncomplete;
        case 'ORDER_NOT_FOUND':
          return t.spotTrade.errors.orderNotFound;
        case 'ORDER_NOT_OPEN':
          return t.spotTrade.errors.orderNotOpen;
        default:
          return fallback || t.spotTrade.errors.failed;
      }
    },
    [
      t.spotTrade.errors.amountTooSmall,
      t.spotTrade.errors.failed,
      t.spotTrade.errors.fokIncomplete,
      t.spotTrade.errors.insufficientBalance,
      t.spotTrade.errors.insufficientLiquidity,
      t.spotTrade.errors.invalidAmount,
      t.spotTrade.errors.invalidPrice,
      t.spotTrade.errors.marketNotFound,
      t.spotTrade.errors.orderNotFound,
      t.spotTrade.errors.orderNotOpen,
      t.spotTrade.errors.priceDeviationExceeded,
      t.spotTrade.errors.priceRequired,
      t.spotTrade.errors.slippageExceeded,
    ]
  );

  const makerPercentLabel = useMemo(() => trimDecimal(new Decimal(fees.maker || 0).div(100).toFixed(2)), [fees.maker]);
  const takerPercentLabel = useMemo(() => trimDecimal(new Decimal(fees.taker || 0).div(100).toFixed(2)), [fees.taker]);
  const feeRateLabel = useMemo(
    () =>
      t.spotTrade.form.makerTaker
        .replace('{maker}', makerPercentLabel)
        .replace('{taker}', takerPercentLabel),
    [makerPercentLabel, takerPercentLabel, t.spotTrade.form.makerTaker]
  );

  const spreadInfo = useMemo(() => {
    if (!bestAskDecimal || !bestBidDecimal) return null;
    const spreadValue = bestAskDecimal.minus(bestBidDecimal);
    const percent = bestAskDecimal.gt(0) ? spreadValue.div(bestAskDecimal).mul(100) : ZERO;
    return {
      value: formatWithPrecision(spreadValue, quoteDecimals),
      percent: trimDecimal(percent.toFixed(2)),
    };
  }, [bestAskDecimal, bestBidDecimal, quoteDecimals]);

  const asksDisplay = useMemo(() => {
    let cumulative = ZERO;
    return orderbook.asks.map((level, idx) => {
      const base = safeDecimal(level.base_amount);
      cumulative = cumulative.plus(base);
      return {
        key: `ask-${idx}`,
        price: trimDecimal(level.price),
        amount: trimDecimal(level.base_amount),
        cumulative: formatWithPrecision(cumulative, baseDecimals),
        rawPrice: level.price,
      };
    });
  }, [orderbook.asks, baseDecimals]);

  const bidsDisplay = useMemo(() => {
    let cumulative = ZERO;
    return orderbook.bids.map((level, idx) => {
      const base = safeDecimal(level.base_amount);
      cumulative = cumulative.plus(base);
      return {
        key: `bid-${idx}`,
        price: trimDecimal(level.price),
        amount: trimDecimal(level.base_amount),
        cumulative: formatWithPrecision(cumulative, baseDecimals),
        rawPrice: level.price,
      };
    });
  }, [orderbook.bids, baseDecimals]);

  const recentTrades = useMemo(() => trades.slice(0, 20), [trades]);

  const handleQuickFill = (ratio: number) => {
    if (!selectedMarketMeta) return;
    if (ratio <= 0) return;
    if (formSide === 'sell') {
      if (availableBase.lte(0)) return;
      const value = availableBase.mul(ratio);
      setAmount(formatWithPrecision(value, amountPrecision));
      amountInputRef.current?.focus();
      return;
    }
    if (availableQuote.lte(0)) return;
    let referencePrice: Decimal | null = null;
    if (formType === 'limit' && priceDecimal && priceDecimal.gt(0)) referencePrice = priceDecimal;
    if (formType === 'market') {
      if (bestAskDecimal && bestAskDecimal.gt(0)) referencePrice = bestAskDecimal;
      else if (selectedMarketMeta.last_price) referencePrice = safeDecimal(selectedMarketMeta.last_price);
    }
    if (!referencePrice || referencePrice.lte(0)) return;
    const portion = availableQuote.mul(ratio);
    const value = portion.div(referencePrice);
    setAmount(formatWithPrecision(value, amountPrecision));
    amountInputRef.current?.focus();
  };

  const handleLevelClick = (value: string) => {
    if (formType !== 'limit') return;
    setPrice(value);
    amountInputRef.current?.focus();
  };

  const handlePlaceOrder = async () => {
    if (!validation.valid || !selectedMarket || placing) return;
    const payload: Record<string, string> = {
      market: selectedMarket,
      side: formSide,
      type: formType,
      amount: amount.trim(),
    };
    if (formType === 'limit' && price.trim()) payload.price = price.trim();
    setPlacing(true);
    const idempotencyKey = crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    const res = await apiFetch<PlaceOrderResponse>('/spot/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    setPlacing(false);
    idempotencyKeyRef.current = null;
    if (!res.ok) {
      const code = (res.data as any)?.error?.code as string | undefined;
      const friendly = mapSpotOrderError(code, res.error || undefined);
      const suffix = code && friendly === (res.error || t.spotTrade.errors.failed) ? ` (${code})` : '';
      toast({ message: `${friendly}${suffix}`, variant: 'error' });
      return;
    }
    toast({ message: t.spotTrade.notifications.placed, variant: 'success' });
    if (res.data.order.status === 'filled') toast({ message: t.spotTrade.notifications.filled, variant: 'success' });
    else if (res.data.order.status === 'cancelled')
      toast({ message: t.spotTrade.notifications.cancelledNoLiquidity, variant: 'error' });
    setAmount('');
    if (formType === 'limit') setPrice('');
    setErrorBanner('');
    await Promise.all([
      loadOrderbook(selectedMarket, { suppressError: true }),
      loadOrders(selectedMarket, { suppressError: true }),
      loadBalances({ suppressError: true }),
    ]);
  };

  const handleCancel = async (id: number) => {
    const res = await apiFetch<{ ok: boolean }>(`/spot/orders/${id}/cancel`, { method: 'POST' });
    if (!res.ok) {
      const code = (res.data as any)?.error?.code as string | undefined;
      const friendly = mapSpotOrderError(code, res.error || t.common.genericError);
      const suffix = code && friendly === (res.error || t.common.genericError) ? ` (${code})` : '';
      toast({ message: `${friendly}${suffix}`, variant: 'error' });
      return;
    }
    toast({ message: t.spotTrade.notifications.cancelled, variant: 'success' });
    await Promise.all([
      loadOrderbook(selectedMarket, { suppressError: true }),
      loadOrders(selectedMarket, { suppressError: true }),
      loadBalances({ suppressError: true }),
    ]);
  };

  if (user === null) return null;

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t.spotTrade.title}</h1>
        <p className="text-sm opacity-80">{t.spotTrade.subtitle}</p>
      </div>
      {errorBanner && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded p-3">{errorBanner}</div>}
      {loadingMarkets ? (
        <div className="text-sm opacity-80">{t.trade.loading}</div>
      ) : markets.length === 0 ? (
        <div className="text-sm opacity-80">{t.spotTrade.noMarkets}</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
          <div className="space-y-4 bg-white/5 rounded-xl p-4">
            <div>
              <label className="block text-xs mb-1 opacity-70">{t.spotTrade.market}</label>
              <select
                value={selectedMarket}
                onChange={(e) => {
                  setSelectedMarket(e.target.value);
                  setAmount('');
                  setPrice('');
                  setErrorBanner('');
                }}
                className="w-full p-2 rounded bg-black/20 border border-white/20 text-sm"
              >
                {markets.map((m) => (
                  <option key={m.symbol} value={m.symbol}>
                    {m.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                className={`flex-1 py-2 rounded font-medium transition ${
                  formSide === 'buy' ? 'bg-green-600 text-white shadow-lg' : 'bg-white/10'
                }`}
                onClick={() => setFormSide('buy')}
              >
                {t.spotTrade.buy}
              </button>
              <button
                className={`flex-1 py-2 rounded font-medium transition ${
                  formSide === 'sell' ? 'bg-red-600 text-white shadow-lg' : 'bg-white/10'
                }`}
                onClick={() => setFormSide('sell')}
              >
                {t.spotTrade.sell}
              </button>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                className={`flex-1 py-2 rounded font-medium transition ${
                  formType === 'limit' ? 'bg-white text-black shadow' : 'bg-white/10 text-white'
                }`}
                onClick={() => setFormType('limit')}
              >
                {t.spotTrade.limit}
              </button>
              <button
                className={`flex-1 py-2 rounded font-medium transition ${
                  formType === 'market' ? 'bg-white text-black shadow' : 'bg-white/10 text-white'
                }`}
                onClick={() => setFormType('market')}
              >
                {t.spotTrade.marketOrder}
              </button>
            </div>
            {selectedMarketMeta && (
              <div className="space-y-1 text-xs">
                <div>
                  {t.spotTrade.balanceLabels.base}:{' '}
                  <span className="font-semibold">{formatWithPrecision(availableBase, baseDecimals)}</span>
                  {lockedBase.gt(0) && (
                    <span className="opacity-70"> ({t.spotTrade.form.locked} {formatWithPrecision(lockedBase, baseDecimals)})</span>
                  )}{' '}
                  {baseSymbol}
                </div>
                <div>
                  {t.spotTrade.balanceLabels.quote}:{' '}
                  <span className="font-semibold">{formatWithPrecision(availableQuote, quoteDecimals)}</span>
                  {lockedQuote.gt(0) && (
                    <span className="opacity-70"> ({t.spotTrade.form.locked} {formatWithPrecision(lockedQuote, quoteDecimals)})</span>
                  )}{' '}
                  {quoteSymbol}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs mb-1 opacity-70">{t.spotTrade.amount}</label>
              <input
                ref={amountInputRef}
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 rounded bg-black/20 border border-white/20 text-sm"
              />
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                {[0.25, 0.5, 0.75, 1].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    className="py-1 rounded bg-white/10 hover:bg-white/20 transition"
                    onClick={() => handleQuickFill(ratio)}
                  >
                    {Math.round(ratio * 100)}%
                  </button>
                ))}
              </div>
            </div>
            {formType === 'limit' && (
              <div>
                <label className="block text-xs mb-1 opacity-70">{t.spotTrade.price}</label>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-2 rounded bg-black/20 border border-white/20 text-sm"
                />
              </div>
            )}
            <div className="text-xs space-y-1 border-t border-white/10 pt-3">
              {formType === 'limit' && totalForDisplay && (
                <div className="flex justify-between">
                  <span className="opacity-70">{t.spotTrade.total}</span>
                  <span>
                    {formatWithPrecision(totalForDisplay, quoteDecimals)} {quoteSymbol}
                  </span>
                </div>
              )}
              {formType === 'market' && marketEstimation && marketEstimation.hasLiquidity && marketEstimation.average && (
                <div className="flex justify-between">
                  <span className="opacity-70">{t.spotTrade.form.estimatedPrice}</span>
                  <span>
                    {formatWithPrecision(marketEstimation.average, pricePrecision)} {quoteSymbol}
                  </span>
                </div>
              )}
              {formType === 'market' && totalForDisplay && (
                <div className="flex justify-between">
                  <span className="opacity-70">{t.spotTrade.form.estimated}</span>
                  <span>
                    {formatWithPrecision(totalForDisplay, quoteDecimals)} {quoteSymbol}
                  </span>
                </div>
              )}
              {estimatedFeeValue && estimatedFeeValue.gt(0) && (
                <div className="flex justify-between">
                  <span className="opacity-70">{t.spotTrade.form.fee}</span>
                  <span>
                    {feeRateLabel} • {formatWithPrecision(estimatedFeeValue, quoteDecimals)} {quoteSymbol}
                  </span>
                </div>
              )}
              {formType === 'market' && amountDecimal && amountDecimal.gt(0) && (
                <div className="text-[11px] opacity-80">
                  {formSide === 'buy'
                    ? t.spotTrade.form.payAtMost
                        .replace('{value}', () => {
                          if (!bestAskDecimal) return '—';
                          const maxCost = amountDecimal.mul(bestAskDecimal).mul(new Decimal(1).plus(slippageFraction));
                          return `${formatWithPrecision(maxCost, quoteDecimals)} ${quoteSymbol}`;
                        })
                        .replace('{slippage}', slippagePercentLabel)
                    : t.spotTrade.form.receiveAtLeast
                        .replace('{value}', () => {
                          if (!bestBidDecimal) return '—';
                          const multiplier = new Decimal(1).minus(slippageFraction);
                          const minReceive = multiplier.gt(0)
                            ? amountDecimal.mul(bestBidDecimal).mul(multiplier)
                            : ZERO;
                          return `${formatWithPrecision(minReceive, quoteDecimals)} ${quoteSymbol}`;
                        })
                        .replace('{slippage}', slippagePercentLabel)}
                </div>
              )}
            </div>
            {selectedMarketMeta && (
              <div className="text-[11px] opacity-70 space-y-1 border-t border-white/10 pt-3">
                {selectedMarketMeta.min_base_amount && (
                  <div>
                    {t.trade.min}: {trimDecimal(selectedMarketMeta.min_base_amount)} {baseSymbol}
                  </div>
                )}
                {selectedMarketMeta.last_price && (
                  <div>
                    {t.spotTrade.lastPrice}: {selectedMarketMeta.last_price} {quoteSymbol}
                  </div>
                )}
              </div>
            )}
            {validation.message && (
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/40 rounded p-2">
                {validation.message}
              </div>
            )}
            <div className="md:static md:p-0 md:bg-transparent md:border-0 sticky bottom-0 left-0 right-0 bg-black/70 backdrop-blur border-t border-white/10 -mx-4 px-4 py-3 rounded-b-xl md:-mx-0 md:rounded-none">
              <button
                onClick={handlePlaceOrder}
                disabled={placing || !validation.valid || !selectedMarket}
                className={`w-full py-3 rounded font-semibold transition text-white disabled:opacity-50 ${
                  formSide === 'buy' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {placing ? t.spotTrade.placing : t.spotTrade.placeOrder}
              </button>
            </div>
          </div>
          <div className="space-y-6">
            <SpotMarketChart
              marketSymbol={selectedMarket}
              baseAsset={baseSymbol}
              quoteAsset={quoteSymbol}
              title={t.spotTrade.chart.title}
              emptyLabel={t.spotTrade.chart.empty}
              enabled={!!selectedMarket}
            />
            <div className="bg-white/5 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <h2 className="font-semibold opacity-80">{t.spotTrade.orderbook.title}</h2>
                <div className="flex flex-wrap gap-3">
                  <span className="text-green-400">
                    {t.spotTrade.buy}: {bestBidDecimal ? formatWithPrecision(bestBidDecimal, pricePrecision) : '—'} {quoteSymbol}
                  </span>
                  <span className="text-red-400">
                    {t.spotTrade.sell}: {bestAskDecimal ? formatWithPrecision(bestAskDecimal, pricePrecision) : '—'} {quoteSymbol}
                  </span>
                  {spreadInfo && (
                    <span className="opacity-80">
                      {t.spotTrade.orderbook.spread}: {spreadInfo.value} {quoteSymbol} ({spreadInfo.percent}%)
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-1 font-semibold opacity-70">
                    <span>{t.spotTrade.orderbook.price}</span>
                    <span className="text-right">{t.spotTrade.orderbook.amount}</span>
                    <span className="text-right">{t.spotTrade.total}</span>
                  </div>
                  <div className="bg-white/5 rounded p-2 space-y-1 max-h-64 overflow-y-auto">
                    {loadingBook ? (
                      <div className="opacity-70">{t.trade.loading}</div>
                    ) : asksDisplay.length === 0 ? (
                      <div className="opacity-70">—</div>
                    ) : (
                      asksDisplay.map((level, idx) => (
                        <button
                          key={level.key}
                          type="button"
                          onClick={() => handleLevelClick(level.rawPrice)}
                          className={`w-full grid grid-cols-3 gap-2 text-left rounded px-1 py-0.5 transition ${
                            idx === 0 ? 'bg-red-500/10' : 'hover:bg-red-500/10'
                          }`}
                        >
                          <span className="text-red-300">{level.price}</span>
                          <span className="text-right">{level.amount}</span>
                          <span className="text-right opacity-80">{level.cumulative}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-1 font-semibold opacity-70">
                    <span>{t.spotTrade.orderbook.price}</span>
                    <span className="text-right">{t.spotTrade.orderbook.amount}</span>
                    <span className="text-right">{t.spotTrade.total}</span>
                  </div>
                  <div className="bg-white/5 rounded p-2 space-y-1 max-h-64 overflow-y-auto">
                    {loadingBook ? (
                      <div className="opacity-70">{t.trade.loading}</div>
                    ) : bidsDisplay.length === 0 ? (
                      <div className="opacity-70">—</div>
                    ) : (
                      bidsDisplay.map((level, idx) => (
                        <button
                          key={level.key}
                          type="button"
                          onClick={() => handleLevelClick(level.rawPrice)}
                          className={`w-full grid grid-cols-3 gap-2 text-left rounded px-1 py-0.5 transition ${
                            idx === 0 ? 'bg-green-500/10' : 'hover:bg-green-500/10'
                          }`}
                        >
                          <span className="text-green-300">{level.price}</span>
                          <span className="text-right">{level.amount}</span>
                          <span className="text-right opacity-80">{level.cumulative}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <h2 className="text-sm font-semibold opacity-80 mb-2">{t.spotTrade.trades.title}</h2>
              <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold opacity-70 mb-1">
                <span>{t.spotTrade.trades.columns.time}</span>
                <span>{t.spotTrade.trades.columns.price}</span>
                <span>{t.spotTrade.trades.columns.amount}</span>
                <span>{t.spotTrade.trades.columns.side}</span>
              </div>
              <div className="space-y-1 text-xs max-h-52 overflow-y-auto">
                {recentTrades.length === 0 ? (
                  <div className="opacity-70">{t.spotTrade.trades.empty}</div>
                ) : (
                  recentTrades.map((trade) => (
                    <div key={trade.id} className="grid grid-cols-4 gap-2">
                      <span className="opacity-70">{new Date(trade.created_at).toLocaleTimeString()}</span>
                      <span className={trade.taker_side === 'buy' ? 'text-green-300' : 'text-red-300'}>{trimDecimal(trade.price)}</span>
                      <span>{trimDecimal(trade.base_amount)}</span>
                      <span className={trade.taker_side === 'buy' ? 'text-green-300' : 'text-red-300'}>
                        {trade.taker_side === 'buy' ? t.spotTrade.buy : t.spotTrade.sell}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <h2 className="text-sm font-semibold opacity-80 mb-2">{t.spotTrade.orders.title}</h2>
              {orders.length === 0 ? (
                <div className="text-xs opacity-70">{t.spotTrade.orders.empty}</div>
              ) : (
                <div className="space-y-2 text-xs">
                  {orders.map((order) => (
                    <div key={order.id} className="p-3 rounded bg-white/10 flex flex-col gap-1">
                      <div className="flex justify-between font-semibold">
                        <span>{order.market}</span>
                        <span className={order.side === 'buy' ? 'text-green-300' : 'text-red-300'}>{order.side.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>{t.spotTrade.type}</span>
                        <span>{order.type}</span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>{t.spotTrade.orders.status[order.status]}</span>
                        {order.price && <span>{order.price}</span>}
                      </div>
                      <div className="flex justify-between">
                        <span>{t.trade.amount}</span>
                        <span>
                          {order.remaining_base_amount}/{order.base_amount}
                        </span>
                      </div>
                      {order.status === 'open' && (
                        <button
                          className="mt-2 py-1 px-2 rounded bg-red-500 text-white text-xs"
                          onClick={() => handleCancel(order.id)}
                        >
                          {t.spotTrade.cancel}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
