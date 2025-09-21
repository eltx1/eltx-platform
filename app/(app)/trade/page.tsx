'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

type Market = {
  asset: string;
  decimals: number;
  price_eltx: string;
  min_amount: string;
  max_amount: string | null;
  spread_bps: number;
  updated_at: string;
  balance_wei: string;
  balance: string;
};

type MarketsResponse = {
  markets: Market[];
  baseAsset: { symbol: string; decimals: number };
  pricing: { mode: string };
};

type Quote = {
  id: string;
  asset: string;
  asset_decimals: number;
  target_decimals: number;
  amount: string;
  amount_wei: string;
  eltx_amount: string;
  eltx_amount_wei: string;
  price_eltx: string;
  rate: string;
  spread_bps: number;
  expires_at: string;
};

type SwapResponse = {
  quote_id: string;
  asset: string;
  amount: string;
  amount_wei: string;
  eltx_amount: string;
  eltx_amount_wei: string;
  rate: string;
  spread_bps: number;
};

function formatWei(wei: string, decimals: number, precision = 6): string {
  try {
    const bn = BigInt(wei);
    const base = 10n ** BigInt(decimals);
    const integer = bn / base;
    let frac = (bn % base).toString().padStart(decimals, '0');
    if (precision >= 0) frac = frac.slice(0, precision).replace(/0+$/, '');
    else frac = frac.replace(/0+$/, '');
    return frac ? `${integer}.${frac}` : integer.toString();
  } catch {
    return '0';
  }
}

function trimDecimal(value: string): string {
  if (!value) return '0';
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return normalized.length ? normalized : '0';
}

function isZero(value?: string | null): boolean {
  if (value === undefined || value === null) return true;
  return /^0(?:\.0+)?$/.test(value);
}

function formatSpread(bps: number): string {
  return (bps / 100).toFixed(2);
}

export default function TradePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [baseAsset, setBaseAsset] = useState<{ symbol: string; decimals: number }>({ symbol: 'ELTX', decimals: 18 });
  const [selectedAsset, setSelectedAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteExpiresIn, setQuoteExpiresIn] = useState<number | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [unauth, setUnauth] = useState(false);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const loadMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    const res = await apiFetch<MarketsResponse>('/trade/markets');
    if (!res.ok) {
      setLoadingMarkets(false);
      if (res.status === 401) {
        setUnauth(true);
        return;
      }
      setError(res.error || t.common.genericError);
      return;
    }
    setUnauth(false);
    setError('');
    setMarkets(res.data.markets);
    setBaseAsset(res.data.baseAsset);
    setLoadingMarkets(false);
  }, [t.common.genericError]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  const selectedMarket = useMemo(
    () => markets.find((m) => m.asset === selectedAsset) || null,
    [markets, selectedAsset]
  );

  useEffect(() => {
    if (!markets.length) {
      setSelectedAsset('');
      return;
    }
    setSelectedAsset((prev) => {
      if (prev && markets.some((m) => m.asset === prev)) return prev;
      return markets[0].asset;
    });
  }, [markets]);

  useEffect(() => {
    setQuote(null);
    setQuoteError('');
  }, [selectedAsset]);

  useEffect(() => {
    if (!quote) {
      setQuoteExpiresIn(null);
      return;
    }
    const expiry = new Date(quote.expires_at).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setQuoteExpiresIn(diff);
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [quote]);

  const quoteExpired = quote && quoteExpiresIn !== null && quoteExpiresIn <= 0;

  const mapTradeError = useCallback(
    (code?: string, fallback?: string) => {
      if (!code) return fallback || t.common.genericError;
      switch (code) {
        case 'AMOUNT_TOO_SMALL':
          return t.trade.errors.amountTooSmall;
        case 'AMOUNT_TOO_LARGE':
          return t.trade.errors.amountTooLarge;
        case 'INVALID_AMOUNT':
          return t.trade.errors.invalidAmount;
        case 'INSUFFICIENT_BALANCE':
          return t.trade.errors.insufficientBalance;
        case 'QUOTE_EXPIRED':
          return t.trade.errors.quoteExpired;
        case 'UNSUPPORTED_ASSET':
        case 'INVALID_ASSET':
          return t.trade.errors.unsupportedAsset;
        default:
          return fallback || t.common.genericError;
      }
    },
    [t.common.genericError, t.trade.errors.amountTooLarge, t.trade.errors.amountTooSmall, t.trade.errors.insufficientBalance, t.trade.errors.invalidAmount, t.trade.errors.quoteExpired, t.trade.errors.unsupportedAsset]
  );

  const handleGetQuote = async () => {
    if (!selectedAsset) return;
    if (!amount) {
      setQuoteError(t.trade.errors.amountRequired);
      return;
    }
    setLoadingQuote(true);
    setQuoteError('');
    const res = await apiFetch<{ quote: Quote }>('/trade/quote', {
      method: 'POST',
      body: JSON.stringify({ asset: selectedAsset, amount }),
    });
    setLoadingQuote(false);
    if (res.ok) {
      setQuote(res.data.quote);
      return;
    }
    const code = (res.data as any)?.error?.code as string | undefined;
    setQuote(null);
    setQuoteError(mapTradeError(code, res.error || undefined));
  };

  const handleConfirm = async () => {
    if (!quote) {
      setQuoteError(t.trade.errors.quoteRequired);
      return;
    }
    if (quoteExpired) {
      setQuoteError(t.trade.errors.quoteExpired);
      return;
    }
    setSubmitting(true);
    const res = await apiFetch<{ swap: SwapResponse }>('/trade/execute', {
      method: 'POST',
      body: JSON.stringify({ quote_id: quote.id }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast(t.trade.success);
      setQuote(null);
      setAmount('');
      setQuoteError('');
      loadMarkets();
      return;
    }
    const code = (res.data as any)?.error?.code as string | undefined;
    setQuoteError(mapTradeError(code, res.error || undefined));
    if (code === 'QUOTE_EXPIRED') setQuote(null);
    if (code === 'INSUFFICIENT_BALANCE') loadMarkets();
  };

  if (unauth) return <div className="p-4">Please sign in</div>;
  if (error) return <div className="p-4">{error}</div>;

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t.trade.title}</h1>
        <p className="text-sm opacity-80">{t.trade.description}</p>
      </div>
      {loadingMarkets ? (
        <div className="text-sm opacity-80">{t.trade.loading}</div>
      ) : markets.length === 0 ? (
        <div className="text-sm opacity-80">{t.trade.noAssets}</div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">{t.trade.asset}</label>
              <select
                value={selectedAsset}
                onChange={(e) => {
                  setSelectedAsset(e.target.value);
                  setAmount('');
                }}
                className="w-full p-2 rounded bg-black/20 border border-white/20"
              >
                {markets.map((m) => (
                  <option key={m.asset} value={m.asset}>
                    {m.asset}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">{t.trade.amount}</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 rounded bg-black/20 border border-white/20"
              />
              {selectedMarket && (
                <div className="text-xs opacity-70 mt-1">
                  {t.trade.balance}: {trimDecimal(formatWei(selectedMarket.balance_wei, selectedMarket.decimals))}{' '}
                  {selectedMarket.asset}
                </div>
              )}
              {selectedMarket && !isZero(selectedMarket.min_amount) && (
                <div className="text-xs opacity-70 mt-1">
                  {t.trade.min}: {trimDecimal(selectedMarket.min_amount)} {selectedMarket.asset}
                </div>
              )}
              {selectedMarket && selectedMarket.max_amount && !isZero(selectedMarket.max_amount) && (
                <div className="text-xs opacity-70 mt-1">
                  {t.trade.max}: {trimDecimal(selectedMarket.max_amount)} {selectedMarket.asset}
                </div>
              )}
            </div>
            {quoteError && <div className="text-xs text-red-500">{quoteError}</div>}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleGetQuote}
                disabled={!selectedAsset || !amount || loadingQuote}
                className="px-3 py-2 bg-gray-100 text-black rounded disabled:opacity-50"
              >
                {loadingQuote ? t.trade.loading : t.trade.getQuote}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!quote || submitting || quoteExpired}
                className="px-3 py-2 bg-white/10 rounded border border-white/10 disabled:opacity-50"
              >
                {submitting ? t.trade.submitting : t.trade.confirm}
              </button>
            </div>
            {quote && (
              <div className="p-4 bg-white/5 rounded space-y-2 text-sm">
                <div className="font-semibold">{t.trade.quote.title}</div>
                <div className="flex justify-between text-xs">
                  <span>{t.trade.quote.rate}</span>
                  <span>
                    {trimDecimal(quote.rate)} {baseAsset.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>{t.trade.quote.youSend}</span>
                  <span>
                    {trimDecimal(quote.amount)} {quote.asset}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>{t.trade.quote.youReceive}</span>
                  <span>
                    {trimDecimal(quote.eltx_amount)} {baseAsset.symbol}
                  </span>
                </div>
                {quote.spread_bps > 0 && (
                  <div className="flex justify-between text-xs opacity-70">
                    <span>{t.trade.quote.spread}</span>
                    <span>{formatSpread(quote.spread_bps)}%</span>
                  </div>
                )}
                {quoteExpiresIn !== null && (
                  <div className={`text-xs ${quoteExpired ? 'text-red-400' : 'opacity-70'}`}>
                    {quoteExpired
                      ? t.trade.quote.expired
                      : `${t.trade.quote.expiresIn}: ${quoteExpiresIn}s`}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="text-xs opacity-60">{t.trade.pricing}</div>
        </div>
      )}
    </div>
  );
}

