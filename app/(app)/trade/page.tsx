'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock, Sparkles } from 'lucide-react';
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
  fee_bps: number;
  fee_asset: string;
  fee_amount: string;
  fee_amount_wei: string;
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
  fee_bps: number;
  fee_asset: string;
  fee_amount: string;
  fee_amount_wei: string;
};

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

function formatRelativeTime(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
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
  const [quoteInput, setQuoteInput] = useState<{ asset: string; amount: string } | null>(null);
  const [quoteExpiresIn, setQuoteExpiresIn] = useState<number | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [unauth, setUnauth] = useState(false);

  const normalizedAmount = amount.trim();

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
    setQuoteInput(null);
    setQuoteError('');
  }, [selectedAsset]);

  const staleQuote = useMemo(() => {
    if (!quote || !quoteInput) return false;
    return quoteInput.asset !== selectedAsset || quoteInput.amount !== normalizedAmount;
  }, [quote, quoteInput, selectedAsset, normalizedAmount]);

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
        case 'QUOTE_NOT_FOUND':
        case 'QUOTE_INACTIVE':
          return t.trade.errors.quoteUnavailable;
        case 'PRICING_UNAVAILABLE':
          return t.trade.errors.pricingUnavailable;
        default:
          return fallback || t.common.genericError;
      }
    },
    [
      t.common.genericError,
      t.trade.errors.amountTooLarge,
      t.trade.errors.amountTooSmall,
      t.trade.errors.insufficientBalance,
      t.trade.errors.invalidAmount,
      t.trade.errors.quoteExpired,
      t.trade.errors.unsupportedAsset,
      t.trade.errors.quoteUnavailable,
      t.trade.errors.pricingUnavailable,
    ]
  );

  const handleGetQuote = async () => {
    if (!selectedAsset) return;
    if (!normalizedAmount) {
      setQuoteError(t.trade.errors.amountRequired);
      return;
    }
    setLoadingQuote(true);
    setQuoteError('');
    setQuoteInput(null);
    const res = await apiFetch<{ quote: Quote }>('/trade/quote', {
      method: 'POST',
      body: JSON.stringify({ asset: selectedAsset, amount: normalizedAmount }),
    });
    setLoadingQuote(false);
    if (res.ok) {
      setQuote(res.data.quote);
      setQuoteInput({ asset: selectedAsset, amount: normalizedAmount });
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
    if (!quoteInput || quoteInput.asset !== selectedAsset || quoteInput.amount !== normalizedAmount) {
      setQuoteError(t.trade.errors.quoteStale);
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
      setQuoteInput(null);
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

  const estimatedReceive = useMemo(() => {
    if (!selectedMarket || !normalizedAmount) return '';
    const price = Number.parseFloat(selectedMarket.price_eltx || '0');
    const amt = Number.parseFloat(normalizedAmount);
    if (!Number.isFinite(price) || !Number.isFinite(amt)) return '';
    const result = price * amt;
    if (!Number.isFinite(result)) return '';
    return trimDecimal(result.toFixed(8));
  }, [normalizedAmount, selectedMarket]);

  const lastUpdatedLabel = useMemo(() => {
    if (!selectedMarket?.updated_at) return '';
    const relative = formatRelativeTime(new Date(selectedMarket.updated_at));
    if (!relative) return '';
    return t.trade.lastUpdated.replace('{time}', relative);
  }, [selectedMarket?.updated_at, t.trade.lastUpdated]);

  const priceDisplay = useMemo(() => {
    if (!selectedMarket) return '';
    return trimDecimal(selectedMarket.price_eltx || '0');
  }, [selectedMarket]);

  const receiveDisplay = quote ? trimDecimal(quote.eltx_amount) : estimatedReceive;
  const rateDisplay = quote ? trimDecimal(quote.rate) : priceDisplay;
  const balanceDisplay = selectedMarket ? trimDecimal(selectedMarket.balance || '0') : '0';
  const minAmountDisplay = selectedMarket && !isZero(selectedMarket.min_amount)
    ? trimDecimal(selectedMarket.min_amount)
    : '';
  const maxAmountDisplay =
    selectedMarket && selectedMarket.max_amount && !isZero(selectedMarket.max_amount)
      ? trimDecimal(selectedMarket.max_amount)
      : '';
  const assetList = useMemo(() => markets.map((m) => m.asset).join(' · '), [markets]);

  const handleUseMax = () => {
    if (!selectedMarket) return;
    setAmount(selectedMarket.balance);
    setQuote(null);
    setQuoteInput(null);
    setQuoteError('');
  };

  if (unauth) return <div className="p-4 text-sm opacity-80">{t.trade.signInRequired}</div>;
  if (error) return <div className="p-4">{error}</div>;

  return (
    <div className="overflow-x-hidden p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/70 via-black to-black p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{t.trade.title}</h1>
              <p className="text-sm text-white/60">{t.trade.description}</p>
            </div>
            {lastUpdatedLabel && (
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <Clock className="h-4 w-4" />
                <span>{lastUpdatedLabel}</span>
              </div>
            )}
          </div>
          {loadingMarkets ? (
            <div className="mt-10 text-sm text-white/60">{t.trade.loading}</div>
          ) : markets.length === 0 ? (
            <div className="mt-10 text-sm text-white/60">{t.trade.noAssets}</div>
          ) : (
            <div className="mt-8 space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60">
                  <span>{t.trade.youPay}</span>
                  <button
                    type="button"
                    onClick={handleUseMax}
                    disabled={!selectedMarket || isZero(balanceDisplay)}
                    className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t.trade.useMax}
                  </button>
                </div>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <select
                        value={selectedAsset}
                        onChange={(e) => {
                          setSelectedAsset(e.target.value);
                          setAmount('');
                          setQuote(null);
                          setQuoteInput(null);
                          setQuoteError('');
                        }}
                        className="w-40 appearance-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 pr-10 text-sm font-medium text-white shadow-inner focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 sm:w-48"
                      >
                        {markets.map((m) => (
                          <option key={m.asset} value={m.asset}>
                            {m.asset}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                    </div>
                    <div className="text-xs text-white/50">
                      {t.trade.balance}: {balanceDisplay} {selectedAsset || '—'}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setQuoteError('');
                      }}
                      placeholder="0.00"
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-right text-3xl font-semibold tracking-tight text-white shadow-inner focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-white/60 sm:grid-cols-2">
                  <div>
                    {t.trade.liveRate}:{' '}
                    <span className="font-medium text-white/80">
                      1 {selectedAsset || '—'} ≈ {priceDisplay || '—'} {baseAsset.symbol}
                    </span>
                  </div>
                  {minAmountDisplay && (
                    <div>
                      {t.trade.min}:{' '}
                      <span className="font-medium text-white/80">
                        {minAmountDisplay} {selectedAsset}
                      </span>
                    </div>
                  )}
                  {maxAmountDisplay && (
                    <div>
                      {t.trade.max}:{' '}
                      <span className="font-medium text-white/80">
                        {maxAmountDisplay} {selectedAsset}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 backdrop-blur">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-200">
                  <span>{t.trade.youReceive}</span>
                  <span>{baseAsset.symbol}</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20 text-lg font-semibold text-emerald-100">
                      {baseAsset.symbol.slice(0, 3)}
                    </div>
                    <div className="text-sm text-emerald-100/80">{baseAsset.symbol}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-semibold tracking-tight text-white">
                      {receiveDisplay || '0'}
                    </div>
                    {quote ? (
                      <div className="text-xs text-emerald-200/80">{t.trade.quote.locked}</div>
                    ) : normalizedAmount && estimatedReceive ? (
                      <div className="text-xs text-white/60">
                        {t.trade.estimated.replace('{amount}', estimatedReceive)} {baseAsset.symbol}
                      </div>
                    ) : (
                      <div className="text-xs text-white/40">{t.trade.awaitingAmount}</div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-100/80">
                  <div>
                    {t.trade.rateLabel}: 1 {selectedAsset || '—'} ≈ {rateDisplay || '—'} {baseAsset.symbol}
                  </div>
                  {quote && quoteExpiresIn !== null && (
                    <div className={`flex items-center gap-1 ${quoteExpired ? 'text-red-300' : 'text-emerald-200/80'}`}>
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {quoteExpired
                          ? t.trade.quote.expiredShort
                          : t.trade.quote.expiresInShort.replace('{seconds}', String(quoteExpiresIn))}{' '}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {quote && (
                <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm text-white shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-100">
                      <Sparkles className="h-4 w-4" />
                      <span className="font-medium">{t.trade.quote.title}</span>
                    </div>
                    <div className={`text-xs ${quoteExpired ? 'text-red-300' : 'text-emerald-200/80'}`}>
                      {quoteExpired
                        ? t.trade.quote.expiredShort
                        : t.trade.quote.expiresInShort.replace('{seconds}', String(quoteExpiresIn ?? 0))}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-white/80 sm:grid-cols-2">
                    <div>
                      <div className="text-white/50 uppercase tracking-wide">{t.trade.quote.youSend}</div>
                      <div className="mt-1 font-medium text-white">
                        {trimDecimal(quote.amount)} {quote.asset}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 uppercase tracking-wide">{t.trade.quote.youReceive}</div>
                      <div className="mt-1 font-medium text-white">
                        {trimDecimal(quote.eltx_amount)} {baseAsset.symbol}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 uppercase tracking-wide">{t.trade.quote.rate}</div>
                      <div className="mt-1 font-medium text-white">
                        {trimDecimal(quote.rate)} {baseAsset.symbol}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 uppercase tracking-wide">{t.trade.quote.platformFee}</div>
                      <div className="mt-1 font-medium text-white">
                        {trimDecimal(quote.fee_amount)} {quote.fee_asset}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/70">
                    {quote.spread_bps > 0 && (
                      <span className="rounded-full bg-white/10 px-3 py-1">
                        {t.trade.quote.spread}: {formatSpread(quote.spread_bps)}%
                      </span>
                    )}
                    {quote.fee_bps > 0 && (
                      <span className="rounded-full bg-white/10 px-3 py-1">
                        {t.trade.quote.feeRate.replace('{bps}', String(quote.fee_bps))}
                      </span>
                    )}
                    {staleQuote && (
                      <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-yellow-200">
                        {t.trade.quote.needsRefresh}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {quoteError && (
                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {quoteError}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleGetQuote}
                  disabled={!selectedAsset || !normalizedAmount || loadingQuote}
                  className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-lg transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingQuote ? t.trade.loading : t.trade.getQuote}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!quote || submitting || quoteExpired || staleQuote}
                  className="flex-1 rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? t.trade.submitting : t.trade.confirm}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
                <span>{t.trade.pricing}</span>
                {assetList && <span>{t.trade.assetsAvailable.replace('{assets}', assetList)}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

