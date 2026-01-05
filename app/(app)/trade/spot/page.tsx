'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { apiFetch } from '../../../lib/api';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import SpotMarketChart from '../../../../components/trade/SpotMarketChart';
import { getDefaultSpotSlippageBps, subscribeSpotSlippage } from '../../../lib/settings';
import SpotMarketSelector from '../../../../components/trade/SpotMarketSelector';
import type { MarketsResponse, SpotMarket } from './types';
import { ZERO, formatWithPrecision, safeDecimal, trimDecimal } from './utils';

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

type SpotStreamPayload = {
  market?: { symbol: string; base_asset: string; quote_asset: string };
  orderbook?: { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
  trades?: OrderbookResponse['trades'];
  orders?: SpotOrder[];
  balances?: Record<string, WalletAsset>;
  fees?: { maker_bps?: number | null; taker_bps?: number | null };
  orderbook_version?: { ts: number; id: number };
  last_trade_id?: number;
};

type SpotStreamMessage =
  | { type: 'snapshot' | 'update'; payload: SpotStreamPayload }
  | { type: 'ping'; payload?: { ts?: number } }
  | { type: 'error'; payload?: { message?: string } };

const MARKET_PRIORITY = ['ELTX/USDT', 'WBTC/USDT', 'BNB/USDT', 'ETH/USDT', 'USDT/USDC', 'MCOIN/USDT', 'ELTX/USDC', 'ELTX/ETH', 'ELTX/BNB'];
const STREAM_TRADE_LIMIT = 50;

function normalizeStreamTrades(trades: OrderbookResponse['trades']): OrderbookResponse['trades'] {
  return trades.slice(0, STREAM_TRADE_LIMIT);
}

function buildSpotWsUrl(base: string, market: string): string {
  const url = new URL(`/spot/ws?market=${encodeURIComponent(market)}`, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
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

function SpotTradePageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [markets, setMarkets] = useState<SpotMarket[]>([]);
  const [fees, setFees] = useState<SpotFees>({ maker: 0, taker: 0 });
  const [selectedMarket, setSelectedMarket] = useState('');
  const [marketSelectorOpen, setMarketSelectorOpen] = useState(false);
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
  const [sliderValue, setSliderValue] = useState(0);
  const [price, setPrice] = useState('');
  const [mobileDepthView, setMobileDepthView] = useState<'orderbook' | 'trades'>('orderbook');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [slippageBps, setSlippageBps] = useState(getDefaultSpotSlippageBps());
  const [lastBalanceError, setLastBalanceError] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const lastStatusesRef = useRef<Map<number, SpotOrder['status']>>(new Map());
  const idempotencyKeyRef = useRef<string | null>(null);
  const streamRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const preventReconnectRef = useRef(false);

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
      setTrades(normalizeStreamTrades(res.data.trades));
    },
    [t.common.genericError]
  );

  const updateOrdersState = useCallback(
    (nextOrders: SpotOrder[]) => {
      setOrders(nextOrders);
      const statusMap = lastStatusesRef.current;
      const seen = new Set<number>();
      nextOrders.forEach((order) => {
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
    [t.spotTrade.notifications.filled, toast]
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
      updateOrdersState(res.data.orders);
    },
    [t.common.genericError, updateOrdersState]
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

  const applyStreamPayload = useCallback((payload: SpotStreamPayload) => {
    if (payload.orderbook) setOrderbook(payload.orderbook);
    if (payload.trades) setTrades(normalizeStreamTrades(payload.trades));
    if (payload.orders) updateOrdersState(payload.orders);
    if (payload.balances) setBalances(payload.balances);
    if (payload.fees) {
      setFees((prev) => {
        const makerBpsRaw = payload.fees?.maker_bps ?? prev.maker;
        const makerBps = Number.isFinite(Number(makerBpsRaw)) ? Number(makerBpsRaw) : prev.maker;
        const takerBpsRaw = payload.fees?.taker_bps ?? payload.fees?.maker_bps ?? prev.taker ?? makerBps;
        const takerBps = Number.isFinite(Number(takerBpsRaw)) ? Number(takerBpsRaw) : makerBps;
        return { maker: makerBps, taker: takerBps };
      });
    }
    setErrorBanner('');
    setStreamConnected(true);
  }, [updateOrdersState]);

  const resetStream = useCallback(() => {
    preventReconnectRef.current = true;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setStreamConnected(false);
  }, []);

  const connectStream = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!selectedMarket) return;
    const base = process.env.NEXT_PUBLIC_API_BASE;
    if (!base) return;
    preventReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    const url = buildSpotWsUrl(base, selectedMarket);
    const socket = new WebSocket(url);
    streamRef.current = socket;
    setStreamConnected(false);

    const handleCloseOrError = () => {
      streamRef.current = null;
      setStreamConnected(false);
      if (preventReconnectRef.current) return;
      if (reconnectTimerRef.current) return;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectStream();
      }, 2500);
    };

    socket.addEventListener('open', () => setStreamConnected(true));
    socket.addEventListener('message', (event) => {
      try {
        const message: SpotStreamMessage = JSON.parse(event.data);
        if (message.type === 'snapshot' || message.type === 'update') {
          applyStreamPayload(message.payload || {});
        } else if (message.type === 'ping') {
          setStreamConnected(true);
        } else if (message.type === 'error') {
          setErrorBanner(message.payload?.message || t.common.genericError);
        }
      } catch (err) {
        console.error('Failed to parse spot stream payload', err);
      }
    });
    socket.addEventListener('close', handleCloseOrError);
    socket.addEventListener('error', handleCloseOrError);
  }, [applyStreamPayload, selectedMarket, t.common.genericError]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  const preferredMarket = useMemo(() => {
    const fromUrl = searchParams?.get('market');
    return fromUrl ? fromUrl.toUpperCase() : '';
  }, [searchParams]);

  useEffect(() => {
    if (!markets.length) return;
    setSelectedMarket((prev) => {
      if (prev && markets.some((m) => m.symbol === prev)) return prev;
      if (preferredMarket) {
        const match = markets.find((m) => m.symbol.toUpperCase() === preferredMarket);
        if (match) return match.symbol;
      }
      return markets[0].symbol;
    });
  }, [markets, preferredMarket]);

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
    resetStream();
    if (selectedMarket) connectStream();
    return () => resetStream();
  }, [selectedMarket, connectStream, resetStream]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsubscribe = subscribeSpotSlippage((value) => setSlippageBps(value));
    return unsubscribe;
  }, []);

  const selectedMarketMeta = useMemo(() => markets.find((m) => m.symbol === selectedMarket) || null, [markets, selectedMarket]);
  const marketAllowsMarketOrders = selectedMarketMeta?.allow_market_orders !== false;
  useEffect(() => {
    if (!marketAllowsMarketOrders && formType === 'market') setFormType('limit');
  }, [marketAllowsMarketOrders, formType]);

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
    if (formType === 'market' && !marketAllowsMarketOrders)
      return { valid: false, message: t.spotTrade.errors.marketOrderDisabled };
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
    marketAllowsMarketOrders,
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
        case 'MARKET_ORDER_DISABLED':
          return t.spotTrade.errors.marketOrderDisabled;
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
      t.spotTrade.errors.marketOrderDisabled,
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

  const displayPrice = useMemo(() => {
    if (selectedMarketMeta?.last_price) return safeDecimal(selectedMarketMeta.last_price);
    if (bestAskDecimal && bestBidDecimal) return bestAskDecimal.plus(bestBidDecimal).div(2);
    if (bestBidDecimal) return bestBidDecimal;
    if (bestAskDecimal) return bestAskDecimal;
    return null;
  }, [bestAskDecimal, bestBidDecimal, selectedMarketMeta?.last_price]);

  const displayPriceLabel = useMemo(
    () => (displayPrice ? formatWithPrecision(displayPrice, pricePrecision) : '—'),
    [displayPrice, pricePrecision]
  );

  const changePercent = useMemo(() => {
    const raw = (selectedMarketMeta as any)?.change_24h ?? (selectedMarketMeta as any)?.change24h ?? null;
    if (raw === null || raw === undefined) return null;
    const value = safeDecimal(raw);
    if (!value.isFinite()) return null;
    return value;
  }, [selectedMarketMeta]);

  const changePercentLabel = useMemo(() => {
    if (!changePercent) return null;
    return trimDecimal(changePercent.toFixed(2));
  }, [changePercent]);

  const askDepthTotal = useMemo(
    () => orderbook.asks.reduce((acc, level) => acc.plus(safeDecimal(level.base_amount)), ZERO),
    [orderbook.asks]
  );
  const bidDepthTotal = useMemo(
    () => orderbook.bids.reduce((acc, level) => acc.plus(safeDecimal(level.base_amount)), ZERO),
    [orderbook.bids]
  );

  const asksDisplay = useMemo(() => {
    let cumulative = ZERO;
    return orderbook.asks.map((level, idx) => {
      const base = safeDecimal(level.base_amount);
      cumulative = cumulative.plus(base);
      return {
        key: `ask-${idx}`,
        price: formatWithPrecision(safeDecimal(level.price), pricePrecision),
        amount: formatWithPrecision(base, amountPrecision),
        cumulative: formatWithPrecision(cumulative, baseDecimals),
        rawPrice: level.price,
        depth: askDepthTotal.gt(0) ? cumulative.div(askDepthTotal).toNumber() : 0,
      };
    });
  }, [orderbook.asks, baseDecimals, amountPrecision, pricePrecision, askDepthTotal]);

  const bidsDisplay = useMemo(() => {
    let cumulative = ZERO;
    return orderbook.bids.map((level, idx) => {
      const base = safeDecimal(level.base_amount);
      cumulative = cumulative.plus(base);
      return {
        key: `bid-${idx}`,
        price: formatWithPrecision(safeDecimal(level.price), pricePrecision),
        amount: formatWithPrecision(base, amountPrecision),
        cumulative: formatWithPrecision(cumulative, baseDecimals),
        rawPrice: level.price,
        depth: bidDepthTotal.gt(0) ? cumulative.div(bidDepthTotal).toNumber() : 0,
      };
    });
  }, [orderbook.bids, baseDecimals, amountPrecision, pricePrecision, bidDepthTotal]);

  const recentTrades = useMemo(() => trades.slice(0, 20), [trades]);

  const onAmountChange = (value: string) => {
    setAmount(value);
    setSliderValue(0);
  };

  const handleQuickFill = (ratio: number) => {
    if (!selectedMarketMeta) return;
    if (ratio <= 0) return;
    setSliderValue(Math.round(ratio * 100));
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

  const handleSliderFill = (value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    setSliderValue(clamped);
    handleQuickFill(clamped / 100);
  };

  const handleLevelClick = (value: string) => {
    if (formType !== 'limit') return;
    setPrice(value);
    amountInputRef.current?.focus();
  };

  const handleBestPrice = () => {
    if (formType !== 'limit') return;
    const reference = formSide === 'buy' ? bestAskDecimal || displayPrice : bestBidDecimal || displayPrice;
    if (!reference) return;
    setPrice(formatWithPrecision(reference, pricePrecision));
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
    setSliderValue(0);
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
      <SpotMarketSelector
        open={marketSelectorOpen}
        markets={markets}
        selectedMarket={selectedMarket}
        onClose={() => setMarketSelectorOpen(false)}
        onSelect={(symbol) => {
          setSelectedMarket(symbol);
          setMarketSelectorOpen(false);
          setAmount('');
          setPrice('');
          setErrorBanner('');
        }}
        strings={{
          title: t.spotTrade.marketSelector.title,
          searchPlaceholder: t.spotTrade.marketSelector.searchPlaceholder,
          favorites: t.spotTrade.marketSelector.favorites,
          all: t.spotTrade.marketSelector.all,
          quotes: t.spotTrade.marketSelector.quotes,
          empty: t.spotTrade.marketSelector.empty,
          lastPrice: t.spotTrade.lastPrice,
          base: t.spotTrade.marketSelector.base,
          quote: t.spotTrade.marketSelector.quote,
          minOrder: t.spotTrade.marketSelector.minOrder,
        }}
      />

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
        <div className="space-y-6">
          <SpotMarketChart
            marketSymbol={selectedMarket}
            baseAsset={baseSymbol}
            quoteAsset={quoteSymbol}
            pricePrecision={pricePrecision}
            title={t.spotTrade.chart.title}
            emptyLabel={t.spotTrade.chart.empty}
            trades={trades}
            enabled={!!selectedMarket}
          />

          <div className="md:hidden space-y-6 pb-28">
            <div className="rounded-3xl bg-gray-900/60 border border-white/10 p-4 shadow-2xl shadow-black/30 space-y-4">
              <div className="flex flex-col items-center text-center gap-3">
                <button
                  type="button"
                  onClick={() => setMarketSelectorOpen(true)}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-left shadow-inner shadow-black/30"
                >
                  <div className="text-[11px] uppercase tracking-wide text-white/60">{t.spotTrade.market}</div>
                  <div className="flex flex-col gap-2 mt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-2xl font-bold">{selectedMarket || t.spotTrade.marketSelector.placeholder}</div>
                      {changePercentLabel && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-tight ${
                            changePercent && changePercent.gt(0)
                              ? 'bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/40'
                              : changePercent && changePercent.lt(0)
                                ? 'bg-[#f6465d]/15 text-[#f6465d] border border-[#f6465d]/40'
                                : 'bg-white/10 text-white/80 border border-white/15'
                          }`}
                        >
                          {changePercentLabel}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] text-white/70">
                        {t.spotTrade.lastPrice}: {displayPriceLabel} {quoteSymbol}
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/15 text-white/80">
                        {t.spotTrade.marketSelector.open}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <div className="text-4xl font-extrabold text-[#0ecb81]">
                      {displayPrice ? formatWithPrecision(displayPrice, pricePrecision) : '—'}
                    </div>
                    <div
                      className={`text-sm px-2 py-1 rounded-full border ${
                        changePercent
                          ? changePercent.gt(0)
                            ? 'bg-[#0ecb81]/15 border-[#0ecb81]/40 text-[#0ecb81]'
                            : changePercent.lt(0)
                              ? 'bg-[#f6465d]/15 border-[#f6465d]/40 text-[#f6465d]'
                              : 'bg-white/10 border-white/20 text-white'
                          : 'bg-white/5 border-white/20 text-white/70'
                      }`}
                    >
                      {changePercentLabel ? `${changePercentLabel}%` : '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/70">
                    <span
                      className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
                        streamConnected ? 'border-green-500/50 bg-green-500/10 text-green-200' : 'border-yellow-400/50 bg-yellow-500/10 text-yellow-100'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                      {streamConnected ? t.trade.liveRate : t.trade.loading}
                    </span>
                    {spreadInfo && (
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/15">
                        {t.spotTrade.orderbook.spread}: {spreadInfo.value} {quoteSymbol}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 w-full">
                <div className="flex items-center justify-between text-[12px] uppercase tracking-wide text-white/70">
                  <span>{t.spotTrade.orderbook.title}</span>
                  <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1 text-[11px] font-semibold shadow-inner shadow-black/20">
                    {(['orderbook', 'trades'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setMobileDepthView(tab)}
                        className={`px-3 py-1.5 rounded-full transition-all duration-200 ${
                          mobileDepthView === tab ? 'bg-white text-black shadow-lg shadow-black/20' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        {tab === 'orderbook' ? t.spotTrade.orderbook.title : t.spotTrade.trades.title}
                      </button>
                    ))}
                  </div>
                </div>

                {mobileDepthView === 'orderbook' ? (
                  <div className="rounded-2xl bg-black/60 border border-white/10 p-3 space-y-3 shadow-inner shadow-black/40">
                    <div className="grid grid-cols-[1fr,0.85fr] text-[12px] uppercase tracking-wide text-white/60">
                      <span>
                        {t.spotTrade.orderbook.price} ({quoteSymbol})
                      </span>
                      <span className="text-right">
                        {t.spotTrade.orderbook.amount} ({baseSymbol})
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                        {loadingBook ? (
                          <div className="opacity-70 text-sm px-1 py-2">{t.trade.loading}</div>
                        ) : (
                          asksDisplay.slice(0, 12).map((level, idx) => (
                            <div key={level.key} className="relative overflow-hidden rounded-lg">
                              <div
                        className="pointer-events-none absolute inset-y-0 right-0 bg-[#f6465d]/15"
                        style={{ width: `${Math.min(100, Math.max(0, level.depth * 100))}%` }}
                      />
                      <button
                        type="button"
                        onClick={() => handleLevelClick(level.rawPrice)}
                        className={`relative w-full grid grid-cols-[1fr,0.9fr] gap-2 px-3 py-2 text-left text-sm transition ${
                          idx === 0 ? 'bg-[#f6465d]/10' : 'hover:bg-[#f6465d]/10'
                        }`}
                      >
                        <span className="truncate font-mono tabular-nums text-[#f6465d] text-lg font-semibold">{level.price}</span>
                        <span className="truncate text-right font-mono tabular-nums text-white text-lg font-semibold">{level.amount}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

                      <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-white/10 px-3 py-3 space-y-1 shadow">
                        <div className="flex items-center justify-between text-[11px] text-white/70">
                          <span className="uppercase tracking-wide">{selectedMarket}</span>
                          {spreadInfo && (
                            <span>
                              {t.spotTrade.orderbook.spread}: {spreadInfo.value} {quoteSymbol}
                            </span>
                          )}
                        </div>
                      <div className="flex items-end justify-between">
                        <div className="text-4xl font-extrabold text-[#0ecb81]">
                          {displayPrice ? formatWithPrecision(displayPrice, pricePrecision) : '—'}
                        </div>
                        <div className="text-sm text-white/70">≈ {displayPriceLabel}</div>
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                        {loadingBook ? (
                          <div className="opacity-70 text-sm px-1 py-2">{t.trade.loading}</div>
                        ) : (
                          bidsDisplay.slice(0, 12).map((level, idx) => (
                            <div key={level.key} className="relative overflow-hidden rounded-lg">
                              <div
                        className="pointer-events-none absolute inset-y-0 left-0 bg-[#0ecb81]/15"
                        style={{ width: `${Math.min(100, Math.max(0, level.depth * 100))}%` }}
                      />
                      <button
                        type="button"
                        onClick={() => handleLevelClick(level.rawPrice)}
                        className={`relative w-full grid grid-cols-[1fr,0.9fr] gap-2 px-3 py-2 text-left text-sm transition ${
                          idx === 0 ? 'bg-[#0ecb81]/10' : 'hover:bg-[#0ecb81]/10'
                        }`}
                      >
                        <span className="truncate font-mono tabular-nums text-[#0ecb81] text-lg font-semibold">{level.price}</span>
                        <span className="truncate text-right font-mono tabular-nums text-white text-lg font-semibold">{level.amount}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-black/60 border border-white/10 p-0 max-h-[360px] overflow-y-auto shadow-inner shadow-black/40">
                    <div className="grid grid-cols-[1fr,0.8fr,0.7fr] gap-2 text-[11px] uppercase tracking-wide text-white/60 px-3 py-2 sticky top-0 bg-black/80 backdrop-blur border-b border-white/10">
                      <span>{t.spotTrade.trades.columns.time}</span>
                      <span className="text-right">{t.spotTrade.trades.columns.price}</span>
                      <span className="text-right">{t.spotTrade.trades.columns.amount}</span>
                    </div>
                    {recentTrades.length === 0 ? (
                      <div className="opacity-70 text-sm px-3 py-2">{t.spotTrade.trades.empty}</div>
                    ) : (
                      recentTrades.slice(0, 18).map((trade) => (
                        <div
                          key={trade.id}
                          className="grid grid-cols-[1fr,0.8fr,0.7fr] gap-2 text-sm rounded-none px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5"
                        >
                          <span className="opacity-70">{new Date(trade.created_at).toLocaleTimeString()}</span>
                          <span className={`${trade.taker_side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'} font-mono tabular-nums text-lg font-semibold text-right`}>
                            {formatWithPrecision(safeDecimal(trade.price), pricePrecision)}
                          </span>
                          <span className="font-mono tabular-nums text-right text-base text-white">
                            {formatWithPrecision(safeDecimal(trade.base_amount), amountPrecision)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5 rounded-3xl bg-gray-900/70 border border-white/10 p-4 shadow-xl shadow-black/25 backdrop-blur">
              <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden flex shadow-inner shadow-black/30">
                <button
                  className={`flex-1 py-3 text-lg font-semibold uppercase tracking-wide transition-all duration-200 ${
                    formSide === 'buy'
                      ? 'bg-[#0ecb81] text-black shadow-lg shadow-emerald-900/50'
                      : 'text-white/70 hover:text-white'
                  }`}
                  onClick={() => setFormSide('buy')}
                >
                  {t.spotTrade.buy}
                </button>
                <button
                  className={`flex-1 py-3 text-lg font-semibold uppercase tracking-wide transition-all duration-200 ${
                    formSide === 'sell'
                      ? 'bg-[#f6465d] text-white shadow-lg shadow-rose-900/50'
                      : 'text-white/70 hover:text-white'
                  }`}
                  onClick={() => setFormSide('sell')}
                >
                  {t.spotTrade.sell}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 text-white/80">
                  <span className="text-white/60">{t.spotTrade.type}</span>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'limit' | 'market')}
                    className="rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm shadow-inner shadow-black/40 focus:outline-none focus:border-emerald-400/70"
                  >
                    <option value="limit">{t.spotTrade.limit}</option>
                    <option value="market" disabled={!marketAllowsMarketOrders}>
                      {t.spotTrade.marketOrder}
                    </option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleBestPrice}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 bg-white/5 shadow transition hover:border-emerald-300/60"
                >
                  BBO
                </button>
              </div>

              {formType === 'limit' && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60">
                    <span>
                      {t.spotTrade.price} ({quoteSymbol})
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70">{t.spotTrade.limit}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="flex-1 rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-lg font-semibold shadow-inner shadow-black/40 focus:outline-none focus:border-[#0ecb81]/70"
                      placeholder="0.00"
                    />
                    <div className="flex flex-col gap-1 text-sm">
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-3 py-1 border border-white/10 hover:border-emerald-300/60 transition"
                        onClick={() => handleLevelClick(formatWithPrecision((priceDecimal || ZERO).plus(1), pricePrecision))}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-3 py-1 border border-white/10 hover:border-emerald-300/60 transition"
                        onClick={() => {
                          const next = priceDecimal ? priceDecimal.minus(1) : ZERO;
                          handleLevelClick(next.gt(0) ? formatWithPrecision(next, pricePrecision) : '0');
                        }}
                      >
                        -
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-wide text-white/60">
                  <span>
                    {t.spotTrade.amount} ({baseSymbol})
                  </span>
                  <div className="flex items-center gap-2 text-[11px] normal-case">
                    <span className="text-white/60">
                      {t.spotTrade.balanceLabels.base}: {formatWithPrecision(availableBase, baseDecimals)} {baseSymbol}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickFill(1)}
                      className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold bg-white/5 hover:border-emerald-300/60 transition"
                    >
                      {formSide === 'buy' ? 'Max Buy' : 'Max Sell'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={amountInputRef}
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => onAmountChange(e.target.value)}
                    className="flex-1 rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-base shadow-inner shadow-black/40 focus:outline-none focus:border-emerald-400/70"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickFill(1)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold border border-white/15 shadow transition hover:border-emerald-300/60"
                  >
                    100%
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={sliderValue}
                    onChange={(e) => handleSliderFill(Number(e.target.value))}
                    className="w-full accent-green-500 h-2 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-white/60 font-semibold tracking-wide">
                    {['0%', '25%', '50%', '75%', '100%'].map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  {[0.25, 0.5, 0.75, 1].map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      className="rounded-lg bg-white/5 px-3 py-2 font-semibold border border-white/10 hover:border-emerald-300/60 hover:bg-white/10 transition"
                      onClick={() => handleQuickFill(ratio)}
                    >
                      {Math.round(ratio * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-white/10 px-3 py-2 text-sm">
                <div className="text-white/70 flex flex-col">
                  <span className="uppercase tracking-wide text-[11px] opacity-70">Avail</span>
                  <span>{t.spotTrade.balanceLabels.quote}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold">
                    {formatWithPrecision(availableQuote, quoteDecimals)} {quoteSymbol}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickFill(1)}
                    className="rounded-full px-3 py-1 text-xs font-semibold border border-emerald-400/40 text-emerald-200 bg-emerald-500/10 hover:border-emerald-300/70 transition"
                  >
                    {formSide === 'buy' ? 'Max Buy' : 'Max Sell'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-emerald-300/60"
              >
                <span>{t.spotTrade.form.advanced || 'Advanced options'}</span>
                <span className="text-xs text-white/60">{showAdvanced ? '−' : '+'}</span>
              </button>
              {showAdvanced && (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-sm text-white/80">
                  <label className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      TP/SL
                    </span>
                    <input type="checkbox" disabled className="accent-emerald-500 scale-110" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Iceberg
                    </span>
                    <input type="checkbox" disabled className="accent-emerald-500 scale-110" />
                  </label>
                  <p className="text-[12px] text-white/60 leading-relaxed">
                    {t.spotTrade.form.makerTaker.replace('{maker}', makerPercentLabel).replace('{taker}', takerPercentLabel)}
                  </p>
                </div>
              )}

              <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2 text-sm shadow-inner shadow-black/30">
                {formType === 'limit' && totalForDisplay && (
                  <div className="flex justify-between">
                    <span className="text-white/70">{t.spotTrade.total}</span>
                    <span className="font-semibold">
                      {formatWithPrecision(totalForDisplay, quoteDecimals)} {quoteSymbol}
                    </span>
                  </div>
                )}
                {formType === 'market' && marketEstimation && marketEstimation.hasLiquidity && marketEstimation.average && (
                  <div className="flex justify-between">
                    <span className="text-white/70">{t.spotTrade.form.estimatedPrice}</span>
                    <span className="font-semibold">
                      {formatWithPrecision(marketEstimation.average, pricePrecision)} {quoteSymbol}
                    </span>
                  </div>
                )}
                {formType === 'market' && totalForDisplay && (
                  <div className="flex justify-between">
                    <span className="text-white/70">{t.spotTrade.form.estimated}</span>
                    <span className="font-semibold">
                      {formatWithPrecision(totalForDisplay, quoteDecimals)} {quoteSymbol}
                    </span>
                  </div>
                )}
                {estimatedFeeValue && estimatedFeeValue.gt(0) && (
                  <div className="flex justify-between">
                    <span className="text-white/70">{t.spotTrade.form.fee}</span>
                    <span className="font-semibold">
                      {feeRateLabel} • {formatWithPrecision(estimatedFeeValue, quoteDecimals)} {quoteSymbol}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">{t.spotTrade.balanceLabels.base}</span>
                  <span className="font-semibold">
                    {formatWithPrecision(availableBase, baseDecimals)} {baseSymbol}
                  </span>
                </div>
              </div>

              {formType === 'market' && amountDecimal && amountDecimal.gt(0) && (
                <div className="text-[12px] text-white/70 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
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
                          const minReceive = multiplier.gt(0) ? amountDecimal.mul(bestBidDecimal).mul(multiplier) : ZERO;
                          return `${formatWithPrecision(minReceive, quoteDecimals)} ${quoteSymbol}`;
                        })
                        .replace('{slippage}', slippagePercentLabel)}
                </div>
              )}

              {validation.message && (
                <div className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/40 rounded-xl p-2">
                  {validation.message}
                </div>
              )}
            </div>

            <div className="md:hidden fixed inset-x-4 bottom-4 z-30">
              <button
                onClick={handlePlaceOrder}
                disabled={placing || !validation.valid || !selectedMarket}
                className={`w-full py-4 rounded-2xl text-lg font-semibold transition text-white shadow-lg shadow-black/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                  formSide === 'buy'
                    ? 'bg-[#0ecb81] hover:brightness-110 text-black'
                    : 'bg-[#f6465d] hover:brightness-110'
                }`}
              >
                {placing
                  ? t.spotTrade.placing
                  : formSide === 'buy'
                    ? `${t.spotTrade.buy} ${baseSymbol || ''}`.trim()
                    : `${t.spotTrade.sell} ${baseSymbol || ''}`.trim()}
              </button>
              <p className="mt-2 text-center text-[11px] text-white/60">{t.spotTrade.form.makerTaker.replace('{maker}', makerPercentLabel).replace('{taker}', takerPercentLabel)}</p>
            </div>

            <div className="rounded-3xl bg-[#070d16]/95 border border-white/10 p-4 shadow-xl shadow-black/25 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <h3 className="font-semibold">{t.spotTrade.trades.title}</h3>
                <span className="text-xs text-white/60">{t.spotTrade.trades.title}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 max-h-64 overflow-y-auto shadow-inner shadow-black/30">
                <div className="grid grid-cols-[1.1fr,0.9fr,0.8fr] text-[11px] uppercase tracking-wide text-white/60 gap-2 px-3 py-2 sticky top-0 bg-black/85 backdrop-blur border-b border-white/10">
                  <span>{t.spotTrade.trades.columns.time}</span>
                  <span className="text-right">{t.spotTrade.trades.columns.price}</span>
                  <span className="text-right">{t.spotTrade.trades.columns.amount}</span>
                </div>
                {recentTrades.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-white/70">{t.spotTrade.trades.empty}</div>
                ) : (
                  recentTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="grid grid-cols-[1.1fr,0.9fr,0.8fr] gap-2 px-3 py-2 text-sm border-b border-white/5 last:border-0 hover:bg-white/5"
                    >
                      <span className="text-white/60">{new Date(trade.created_at).toLocaleTimeString()}</span>
                      <span className={`${trade.taker_side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'} font-mono tabular-nums text-lg font-semibold text-right`}>
                        {formatWithPrecision(safeDecimal(trade.price), pricePrecision)}
                      </span>
                      <span className="font-mono tabular-nums text-right text-base text-white">
                        {formatWithPrecision(safeDecimal(trade.base_amount), amountPrecision)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-[#0b1320]/90 border border-white/10 p-4 shadow-xl shadow-black/25 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="px-3 py-1 rounded-full bg-[#0ecb81]/15 border border-[#0ecb81]/40 text-[#0ecb81]">
                  {t.spotTrade.tabs.open} ({orders.length})
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">{t.spotTrade.tabs.holdings}</span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">{t.spotTrade.tabs.grid}</span>
              </div>
              {orders.length === 0 ? (
                <div className="text-sm text-white/70">{t.spotTrade.orders.empty}</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {orders.map((order) => (
                    <div key={order.id} className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-2 shadow-inner shadow-black/20">
                      <div className="flex justify-between font-semibold">
                        <span>{order.market}</span>
                        <span className={order.side === 'buy' ? 'text-green-300' : 'text-red-300'}>{order.side.toUpperCase()}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-white/80">
                        <div>
                          <div className="text-[11px] text-white/60">{t.spotTrade.type}</div>
                          <div className="font-semibold uppercase">{order.type}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-white/60">{t.spotTrade.orders.status[order.status]}</div>
                          {order.price && (
                            <div className="font-mono tabular-nums text-base">
                              {formatWithPrecision(safeDecimal(order.price), pricePrecision)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-white/80">
                        <span>{t.trade.amount}</span>
                        <span className="font-mono tabular-nums text-base">
                          {formatWithPrecision(safeDecimal(order.remaining_base_amount), amountPrecision)}/
                          {formatWithPrecision(safeDecimal(order.base_amount), amountPrecision)}
                        </span>
                      </div>
                      {order.status === 'open' && (
                        <button
                          className="mt-1 py-2 px-3 rounded-xl bg-red-600 text-white text-sm font-semibold shadow shadow-red-900/40"
                          onClick={() => handleCancel(order.id)}
                        >
                          {t.spotTrade.cancel}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl bg-black/50 border border-white/10 p-3 text-center space-y-2 shadow-inner shadow-black/30">
                <div className="text-sm font-semibold text-white/80">{t.spotTrade.balanceLabels.quote}</div>
                <div className="text-xl font-semibold">
                  {formatWithPrecision(availableQuote, quoteDecimals)} {quoteSymbol || ''}
                </div>
                <div className="text-xs text-white/60">
                  {t.spotTrade.form
                    .payAtMost.replace('{value}', `${formatWithPrecision(availableQuote, quoteDecimals)} ${quoteSymbol || ''}`)
                    .replace('{slippage}', slippagePercentLabel)}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden md:grid gap-6 2xl:grid-cols-[400px,1fr] xl:grid-cols-[360px,1fr]">
            <div className="space-y-5 bg-gray-900/60 border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/20 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <label className="block text-xs opacity-70">{t.spotTrade.market}</label>
                  <button
                    type="button"
                    onClick={() => setMarketSelectorOpen(true)}
                    className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-3 text-left transition hover:border-cyan-400/50 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">
                            {selectedMarket || t.spotTrade.marketSelector.placeholder}
                          </span>
                          {quoteSymbol && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                              {quoteSymbol}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/60">
                          {t.spotTrade.lastPrice}: {displayPriceLabel} {quoteSymbol}
                        </div>
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                        {t.spotTrade.marketSelector.open}
                      </span>
                    </div>
                  </button>
                </div>
                <div className="hidden md:flex flex-col items-end text-xs gap-1">
                  <span className={`px-2 py-1 rounded-full ${streamConnected ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-100'}`}>
                    {streamConnected ? t.trade.liveRate : t.trade.loading}
                  </span>
                  {spreadInfo && (
                    <span className="opacity-70">
                      {t.spotTrade.orderbook.spread}: {spreadInfo.value} {quoteSymbol}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-white/10 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>{selectedMarket}</span>
                  {selectedMarketMeta?.last_price && <span>{t.spotTrade.lastPrice}</span>}
                </div>
                <div className="flex items-baseline gap-3">
                  <div className="text-3xl font-semibold">
                    {displayPrice ? formatWithPrecision(displayPrice, pricePrecision) : '—'} {quoteSymbol}
                  </div>
                  {bestBidDecimal && bestAskDecimal && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-70">
                      <span className="text-green-300">
                        {t.spotTrade.buy}: {formatWithPrecision(bestBidDecimal, pricePrecision)}
                      </span>
                      <span className="text-red-300">
                        {t.spotTrade.sell}: {formatWithPrecision(bestAskDecimal, pricePrecision)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {spreadInfo && (
                    <span className="px-2 py-1 rounded bg-white/10">
                      {t.spotTrade.orderbook.spread}: {spreadInfo.value} {quoteSymbol} ({spreadInfo.percent}%)
                    </span>
                  )}
                  {selectedMarketMeta?.min_base_amount && (
                    <span className="px-2 py-1 rounded bg-white/10">
                      {t.trade.min}: {trimDecimal(selectedMarketMeta.min_base_amount)} {baseSymbol}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden grid grid-cols-2 text-sm border border-white/10 bg-black/40 shadow-inner shadow-black/30">
                <button
                  className={`py-3 font-semibold uppercase tracking-wide transition-all duration-200 ${
                    formSide === 'buy'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-500 text-white shadow-lg shadow-emerald-900/40'
                      : 'text-white/70 hover:text-white'
                  }`}
                  onClick={() => setFormSide('buy')}
                >
                  {t.spotTrade.buy}
                </button>
                <button
                  className={`py-3 font-semibold uppercase tracking-wide transition-all duration-200 ${
                    formSide === 'sell'
                      ? 'bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-lg shadow-rose-900/40'
                      : 'text-white/70 hover:text-white'
                  }`}
                  onClick={() => setFormSide('sell')}
                >
                  {t.spotTrade.sell}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/40 p-1">
                  <button
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 ${
                      formType === 'limit' ? 'bg-white text-black shadow' : 'text-white/70'
                    }`}
                    onClick={() => setFormType('limit')}
                  >
                    {t.spotTrade.limit}
                  </button>
                  <button
                    disabled={!marketAllowsMarketOrders}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 ${
                      formType === 'market' ? 'bg-white text-black shadow' : 'text-white/70'
                    } ${!marketAllowsMarketOrders ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => setFormType('market')}
                  >
                    {t.spotTrade.marketOrder}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {!marketAllowsMarketOrders && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-100 border border-amber-400/30">
                      {t.spotTrade.errors.marketOrderDisabled}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleBestPrice}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 bg-white/5 shadow transition hover:border-emerald-300/60"
                  >
                    BBO
                  </button>
                </div>
              </div>

              {selectedMarketMeta && (
                <div className="grid grid-cols-2 gap-3 text-xs rounded-xl bg-white/5 p-3 border border-white/10">
                  <div>
                    <div className="opacity-70">{t.spotTrade.balanceLabels.base}</div>
                    <div className="font-semibold">
                      {formatWithPrecision(availableBase, baseDecimals)} {baseSymbol}
                    </div>
                    {lockedBase.gt(0) && (
                      <div className="text-[11px] opacity-70">
                        {t.spotTrade.form.locked} {formatWithPrecision(lockedBase, baseDecimals)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="opacity-70">{t.spotTrade.balanceLabels.quote}</div>
                    <div className="font-semibold">
                      {formatWithPrecision(availableQuote, quoteDecimals)} {quoteSymbol}
                    </div>
                    {lockedQuote.gt(0) && (
                      <div className="text-[11px] opacity-70">
                        {t.spotTrade.form.locked} {formatWithPrecision(lockedQuote, quoteDecimals)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/50 p-4">
                {formType === 'limit' && (
                  <div className="grid grid-cols-[120px,1fr] items-center gap-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
                      <span>{t.spotTrade.price}</span>
                      <span className="text-[11px] text-white/40">({quoteSymbol})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full rounded-xl bg-black/60 border border-white/15 px-4 py-2.5 text-sm shadow-inner shadow-black/40 focus:outline-none focus:border-emerald-400/70"
                        placeholder="0.00"
                      />
                      <div className="flex flex-col gap-1 text-xs">
                        <button
                          type="button"
                          className="rounded-lg bg-white/10 px-3 py-1 border border-white/10 hover:border-emerald-300/60 transition"
                          onClick={() => handleLevelClick(formatWithPrecision((priceDecimal || ZERO).plus(1), pricePrecision))}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-white/10 px-3 py-1 border border-white/10 hover:border-emerald-300/60 transition"
                          onClick={() => {
                            const next = priceDecimal ? priceDecimal.minus(1) : ZERO;
                            handleLevelClick(next.gt(0) ? formatWithPrecision(next, pricePrecision) : '0');
                          }}
                        >
                          -
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-[120px,1fr] items-start gap-3">
                  <div className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                    <span>
                      {t.spotTrade.amount} ({baseSymbol})
                    </span>
                    <span className="text-[11px] text-white/50 normal-case">
                      {t.spotTrade.balanceLabels.base}: {formatWithPrecision(availableBase, baseDecimals)} {baseSymbol}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        ref={amountInputRef}
                        type="number"
                        min="0"
                        value={amount}
                        onChange={(e) => onAmountChange(e.target.value)}
                        className="flex-1 rounded-xl bg-black/60 border border-white/15 px-4 py-2.5 text-sm shadow-inner shadow-black/40 focus:outline-none focus:border-emerald-400/70"
                        placeholder="0.00"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuickFill(1)}
                        className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold border border-white/15 shadow transition hover:border-emerald-300/60"
                      >
                        100%
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span>
                        {t.spotTrade.balanceLabels.quote}: {formatWithPrecision(availableQuote, quoteDecimals)} {quoteSymbol}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickFill(1)}
                        className="rounded-full border border-emerald-400/40 px-3 py-1 text-[11px] font-semibold bg-emerald-500/10 hover:border-emerald-300/70 transition"
                      >
                        {formSide === 'buy' ? 'Max Buy' : 'Max Sell'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sliderValue}
                        onChange={(e) => handleSliderFill(Number(e.target.value))}
                        className="w-full accent-green-500 h-2 cursor-pointer"
                      />
                      <div className="flex justify-between text-[11px] text-white/60 font-semibold tracking-wide">
                        {['0%', '25%', '50%', '75%', '100%'].map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px]">
                      {[0.25, 0.5, 0.75, 1].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          className="py-1.5 rounded-lg bg-white/10 border border-white/10 hover:border-emerald-300/60 hover:bg-white/15 transition"
                          onClick={() => handleQuickFill(ratio)}
                        >
                          {Math.round(ratio * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-emerald-300/60"
              >
                <span>{t.spotTrade.form.advanced || 'Advanced options'}</span>
                <span className="text-xs text-white/60">{showAdvanced ? '−' : '+'}</span>
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-sm text-white/80">
                  <label className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      TP/SL
                    </span>
                    <input type="checkbox" disabled className="accent-emerald-500 scale-110" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Iceberg
                    </span>
                    <input type="checkbox" disabled className="accent-emerald-500 scale-110" />
                  </label>
                  <p className="col-span-2 text-[12px] text-white/60 leading-relaxed">
                    {t.spotTrade.form.makerTaker.replace('{maker}', makerPercentLabel).replace('{taker}', takerPercentLabel)}
                  </p>
                </div>
              )}

              <div className="text-xs space-y-2 rounded-xl bg-white/5 border border-white/10 p-3">
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

              {validation.message && (
                <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/40 rounded p-2">
                  {validation.message}
                </div>
              )}

              <div className="md:static md:p-0 md:bg-transparent md:border-0 sticky bottom-0 left-0 right-0 bg-black/70 backdrop-blur border-t border-white/10 -mx-4 px-4 py-3 rounded-b-2xl md:-mx-0 md:rounded-none">
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing || !validation.valid || !selectedMarket}
                  className={`w-full py-3.5 rounded-xl font-semibold transition text-white disabled:opacity-50 ${
                    formSide === 'buy'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-500 hover:brightness-110 shadow-lg shadow-emerald-900/40'
                      : 'bg-gradient-to-r from-rose-600 to-red-500 hover:brightness-110 shadow-lg shadow-rose-900/40'
                  }`}
                >
                  {placing
                    ? t.spotTrade.placing
                    : formSide === 'buy'
                      ? `${t.spotTrade.buy} ${baseSymbol || ''}`.trim()
                      : `${t.spotTrade.sell} ${baseSymbol || ''}`.trim()}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5 space-y-4 shadow-lg shadow-black/20">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white/90">{t.spotTrade.orderbook.title}</h2>
                    {spreadInfo && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/70">
                        {t.spotTrade.orderbook.spread}: {spreadInfo.value} {quoteSymbol} ({spreadInfo.percent}%)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <span className="text-green-400">
                      {t.spotTrade.buy}: {bestBidDecimal ? formatWithPrecision(bestBidDecimal, pricePrecision) : '—'} {quoteSymbol}
                    </span>
                    <span className="text-red-400">
                      {t.spotTrade.sell}: {bestAskDecimal ? formatWithPrecision(bestAskDecimal, pricePrecision) : '—'} {quoteSymbol}
                    </span>
                  </div>
                </div>

                <div className="grid lg:grid-cols-[1.15fr,0.85fr] gap-4">
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr,0.85fr,0.85fr] text-[11px] font-semibold uppercase tracking-wide text-white/60 px-1">
                      <span>{t.spotTrade.orderbook.price}</span>
                      <span className="text-right">{t.spotTrade.orderbook.amount}</span>
                      <span className="text-right">{t.spotTrade.total}</span>
                    </div>
                    <div className="rounded-xl bg-black/50 border border-white/10 p-2 space-y-1 max-h-[420px] overflow-y-auto shadow-inner shadow-black/30">
                      {loadingBook ? (
                        <div className="opacity-70 px-2 py-3 text-sm">{t.trade.loading}</div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            {asksDisplay.length === 0 ? (
                              <div className="opacity-70 px-2 py-2 text-sm">—</div>
                            ) : (
                              asksDisplay.map((level, idx) => (
                                <div key={level.key} className="relative overflow-hidden rounded-lg">
                                  <div
                                    className="pointer-events-none absolute inset-y-0 right-0 bg-red-500/10"
                                    style={{ width: `${Math.min(100, Math.max(0, level.depth * 100))}%` }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleLevelClick(level.rawPrice)}
                                    className={`relative w-full grid min-w-0 grid-cols-[1fr,0.85fr,0.85fr] gap-2 text-left rounded px-2 py-1 transition ${
                                      idx === 0 ? 'bg-red-500/10' : 'hover:bg-red-500/10'
                                    }`}
                                  >
                                    <span className="truncate font-mono tabular-nums text-red-300 text-sm">{level.price}</span>
                                    <span className="truncate text-right font-mono tabular-nums text-sm">{level.amount}</span>
                                    <span className="truncate text-right font-mono tabular-nums text-xs text-white/70">{level.cumulative}</span>
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="px-3 py-3 my-1 rounded-lg border border-white/10 bg-white/5 flex items-center justify-between text-sm">
                            <div className="flex flex-col">
                              <span className="text-xs uppercase tracking-wide text-white/60">{selectedMarket}</span>
                              <span className="text-2xl font-semibold text-green-400">
                                {displayPrice ? formatWithPrecision(displayPrice, pricePrecision) : '—'} {quoteSymbol}
                              </span>
                            </div>
                            <div className="text-right text-[11px] text-white/70">
                              <div>
                                {t.spotTrade.buy}: {bestBidDecimal ? formatWithPrecision(bestBidDecimal, pricePrecision) : '—'}
                              </div>
                              <div>
                                {t.spotTrade.sell}: {bestAskDecimal ? formatWithPrecision(bestAskDecimal, pricePrecision) : '—'}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            {bidsDisplay.length === 0 ? (
                              <div className="opacity-70 px-2 py-2 text-sm">—</div>
                            ) : (
                              bidsDisplay.map((level, idx) => (
                                <div key={level.key} className="relative overflow-hidden rounded-lg">
                                  <div
                                    className="pointer-events-none absolute inset-y-0 left-0 bg-green-500/10"
                                    style={{ width: `${Math.min(100, Math.max(0, level.depth * 100))}%` }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleLevelClick(level.rawPrice)}
                                    className={`relative w-full grid min-w-0 grid-cols-[1fr,0.85fr,0.85fr] gap-2 text-left rounded px-2 py-1 transition ${
                                      idx === 0 ? 'bg-green-500/10' : 'hover:bg-green-500/10'
                                    }`}
                                  >
                                    <span className="truncate font-mono tabular-nums text-green-300 text-sm">{level.price}</span>
                                    <span className="truncate text-right font-mono tabular-nums text-sm">{level.amount}</span>
                                    <span className="truncate text-right font-mono tabular-nums text-xs text-white/70">{level.cumulative}</span>
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/50 border border-white/10 p-3 space-y-2 shadow-inner shadow-black/30">
                    <h3 className="text-sm font-semibold text-white/90">{t.spotTrade.trades.title}</h3>
                    <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                      <span>{t.spotTrade.trades.columns.time}</span>
                      <span>{t.spotTrade.trades.columns.price}</span>
                      <span>{t.spotTrade.trades.columns.amount}</span>
                      <span>{t.spotTrade.trades.columns.side}</span>
                    </div>
                    <div className="space-y-1 text-xs max-h-[360px] overflow-y-auto">
                      {recentTrades.length === 0 ? (
                        <div className="opacity-70">{t.spotTrade.trades.empty}</div>
                      ) : (
                        recentTrades.map((trade) => (
                          <div key={trade.id} className="grid grid-cols-4 gap-2 rounded-lg px-2 py-1 hover:bg-white/5 transition">
                            <span className="opacity-70">{new Date(trade.created_at).toLocaleTimeString()}</span>
                            <span className={`${trade.taker_side === 'buy' ? 'text-green-300' : 'text-red-300'} font-mono tabular-nums`}>
                              {formatWithPrecision(safeDecimal(trade.price), pricePrecision)}
                            </span>
                            <span className="font-mono tabular-nums">{formatWithPrecision(safeDecimal(trade.base_amount), amountPrecision)}</span>
                            <span className={trade.taker_side === 'buy' ? 'text-green-300' : 'text-red-300'}>
                              {trade.taker_side === 'buy' ? t.spotTrade.buy : t.spotTrade.sell}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4 shadow-lg shadow-black/10">
                <h2 className="text-sm font-semibold opacity-80 mb-2">{t.spotTrade.orders.title}</h2>
                {orders.length === 0 ? (
                  <div className="text-xs opacity-70">{t.spotTrade.orders.empty}</div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {orders.map((order) => (
                      <div key={order.id} className="p-3 rounded-xl bg-white/10 border border-white/10 flex flex-col gap-2">
                        <div className="flex justify-between font-semibold">
                          <span>{order.market}</span>
                          <span className={order.side === 'buy' ? 'text-green-300' : 'text-red-300'}>{order.side.toUpperCase()}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 opacity-80">
                          <div>
                            <div className="text-[11px]">{t.spotTrade.type}</div>
                            <div className="font-semibold uppercase">{order.type}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px]">{t.spotTrade.orders.status[order.status]}</div>
                            {order.price && (
                              <div className="font-mono tabular-nums">
                                {formatWithPrecision(safeDecimal(order.price), pricePrecision)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span>{t.trade.amount}</span>
                          <span>
                            <span className="font-mono tabular-nums">
                              {formatWithPrecision(safeDecimal(order.remaining_base_amount), amountPrecision)}
                            </span>
                            /
                            <span className="font-mono tabular-nums">
                              {formatWithPrecision(safeDecimal(order.base_amount), amountPrecision)}
                            </span>
                          </span>
                        </div>
                        {order.status === 'open' && (
                          <button
                            className="mt-1 py-1.5 px-2 rounded-lg bg-red-500 text-white text-xs"
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
        </div>
      )}
    </div>
  );
}

export default function SpotTradePage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/70">Loading spot markets…</div>}>
      <SpotTradePageContent />
    </Suspense>
  );
}
