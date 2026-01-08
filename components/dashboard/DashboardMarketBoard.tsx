'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpRight, RefreshCw, Sparkles } from 'lucide-react';
import { apiFetch } from '../../app/lib/api';
import { PLATFORM_LOGO_URL } from '../../app/lib/branding';
import { dict, useLang } from '../../app/lib/i18n';
import { resolveSpotMarketSymbol } from '../trade/utils';

type DashboardMarketEntry = {
  symbol: string;
  label: string;
  priceUsd: number | null;
  change24h?: number | null;
  source: 'spot' | 'coingecko' | 'cache' | 'fallback' | 'unknown';
  updatedAt: string | null;
  logoUrl?: string | null;
};

type DashboardMarketResponse = {
  markets: DashboardMarketEntry[];
};

const FALLBACK_LOGOS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1547033579',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png?1595348880',
  BNB: 'https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png?1547034615',
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png?1640133422',
  PEPE: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1682922725',
  ELTX: PLATFORM_LOGO_URL,
};

const DEMO_MARKETS: DashboardMarketEntry[] = [
  { symbol: 'BNB', label: 'BNB', priceUsd: 899.7, change24h: 2.71, source: 'coingecko', updatedAt: new Date().toISOString() },
  { symbol: 'BTC', label: 'Bitcoin', priceUsd: 91316.95, change24h: 1.37, source: 'coingecko', updatedAt: new Date().toISOString() },
  { symbol: 'ETH', label: 'Ethereum', priceUsd: 3136.99, change24h: 0.96, source: 'coingecko', updatedAt: new Date().toISOString() },
  { symbol: 'SOL', label: 'Solana', priceUsd: 134.8, change24h: 2.26, source: 'coingecko', updatedAt: new Date().toISOString() },
  { symbol: 'PEPE', label: 'PEPE', priceUsd: 0.00000704, change24h: 15.41, source: 'coingecko', updatedAt: new Date().toISOString() },
];

function formatUsdLines(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return { primary: '—', secondary: '—' };
  const primary =
    value >= 1000
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
      : value.toLocaleString('en-US', { maximumFractionDigits: value >= 1 ? 2 : 6, minimumFractionDigits: value >= 1 ? 2 : 2 });
  const secondary = `$${value.toLocaleString('en-US', { maximumFractionDigits: value >= 1 ? 2 : 8, minimumFractionDigits: value >= 1 ? 2 : 4 })}`;
  return { primary, secondary };
}

function formatChange(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const fixed = value.toFixed(2);
  const direction: 'up' | 'down' | 'flat' = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return {
    label: `${value > 0 ? '+' : ''}${fixed}%`,
    direction,
  };
}

function formatUpdatedLabel(value: string | null, t: (typeof dict)[keyof typeof dict]) {
  if (!value) return t.dashboard.market.timestampLabel(t.dashboard.market.timestampFallback);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t.dashboard.market.timestampLabel(t.dashboard.market.timestampFallback);
  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes <= 1) return t.dashboard.market.timestampLabel(t.dashboard.market.timestampFresh);
  if (diffMinutes < 60) return t.dashboard.market.timestampLabel(t.dashboard.market.timestampMinutes(diffMinutes));
  const hours = Math.max(1, Math.floor(diffMinutes / 60));
  return t.dashboard.market.timestampLabel(t.dashboard.market.timestampHours(hours));
}

function MarketSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-transparent px-3 py-2 shadow-inner shadow-black/25 sm:px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[10px] font-semibold uppercase text-white/60 ring-1 ring-inset ring-white/15 sm:h-9 sm:w-9">
          {symbol}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-3 w-20 rounded bg-white/10 sm:w-24" />
          <div className="h-3 w-16 rounded bg-white/10 sm:w-20" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <div className="h-3 w-16 rounded bg-white/10 sm:w-20" />
        <div className="h-3 w-12 rounded bg-white/5 sm:w-16" />
      </div>
      <div className="ml-auto h-7 w-16 rounded-full bg-white/10 sm:w-20" />
    </div>
  );
}

function TokenAvatar({ symbol, label, logoUrl }: { symbol: string; label: string; logoUrl?: string | null }) {
  const normalizedSymbol = symbol.toUpperCase();
  const src = normalizedSymbol === 'ELTX' ? PLATFORM_LOGO_URL : logoUrl || FALLBACK_LOGOS[normalizedSymbol];
  return (
    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-white/10 via-white/5 to-transparent text-[10px] font-bold uppercase tracking-tight text-white ring-1 ring-inset ring-white/15 shadow-md shadow-black/30 sm:h-9 sm:w-9">
      {src ? (
        <img src={src} alt={`${label} logo`} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        symbol.slice(0, 3)
      )}
    </div>
  );
}

export default function DashboardMarketBoard() {
  const { lang } = useLang();
  const t = dict[lang];
  const [markets, setMarkets] = useState<DashboardMarketEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<DashboardMarketResponse>('/api/markets');
    if (!res.ok) {
      setError(res.error || t.common.genericError);
      setMarkets([]);
      setLoading(false);
      return;
    }
    setError('');
    const incoming = res.data.markets || [];
    const shouldUseDemo = process.env.NEXT_PUBLIC_DEMO_MODE === '1' && (!incoming.length || incoming.every((m) => m.priceUsd === null));
    setMarkets(shouldUseDemo ? DEMO_MARKETS : incoming);
    setLoading(false);
  }, [t.common.genericError]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  const latestUpdateLabel = useMemo(() => {
    const latest = markets.reduce((acc, market) => {
      const ts = market.updatedAt ? Date.parse(market.updatedAt) : 0;
      return Number.isFinite(ts) ? Math.max(acc, ts) : acc;
    }, 0);
    return formatUpdatedLabel(latest ? new Date(latest).toISOString() : null, t);
  }, [markets, t]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="space-y-2">
          {['EL', 'BT', 'ET', 'BN', 'SO'].map((symbol) => (
            <MarketSkeleton key={symbol} symbol={symbol} />
          ))}
        </div>
      );
    }

    if (!markets.length) {
      return <p className="text-sm text-white/70">{t.dashboard.market.empty}</p>;
    }

    return (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f18]/70 shadow-2xl shadow-black/40 ring-1 ring-white/5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 bg-white/[0.03] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 sm:px-5 sm:text-[11px]">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            {t.home.market.layout.pair}
          </span>
          <span className="text-right">{t.home.market.layout.price}</span>
          <span className="text-right">{t.home.market.layout.change}</span>
        </div>
        {markets.map((marketRaw) => {
          const market = {
            ...marketRaw,
            logoUrl: marketRaw.logoUrl || FALLBACK_LOGOS[marketRaw.symbol.toUpperCase()],
          };
          const change = formatChange(market.change24h ?? null);
          const sourceLabel = t.home.market.sourceLabel[market.source] ?? t.home.market.sourceLabel.unknown;
          const priceLines = formatUsdLines(market.priceUsd);
          return (
            <Link
              key={market.symbol}
              href={`/trade/spot?market=${encodeURIComponent(resolveSpotMarketSymbol(market.symbol))}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-white/5 bg-gradient-to-r from-white/[0.01] via-white/[0.02] to-transparent px-3.5 py-2 transition hover:bg-white/[0.05] last:border-b-0 sm:px-5"
              aria-label={`${market.label} spot market`}
            >
              <div className="flex items-center gap-2 sm:gap-2.5">
                <TokenAvatar symbol={market.symbol} label={market.label} logoUrl={market.logoUrl} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 sm:text-sm">
                  <span className="font-semibold text-white">{market.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{market.symbol}</span>
                  <span className="text-[10px] text-white/50">•</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/60 ring-1 ring-inset ring-white/10">
                    {sourceLabel}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 text-right text-sm text-white sm:text-base">
                <span className="font-semibold">{priceLines.primary}</span>
                <span className="text-[10px] text-white/50 sm:text-[11px]">{priceLines.secondary}</span>
              </div>
              <div className="ml-auto flex items-center justify-end">
                {change ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold shadow-md shadow-black/30 ring-1 ring-inset ${
                      change.direction === 'up'
                        ? 'bg-emerald-500 text-emerald-50 ring-emerald-400/80'
                        : change.direction === 'down'
                          ? 'bg-rose-500 text-rose-50 ring-rose-300/70'
                          : 'bg-white/10 text-white/80 ring-white/15'
                    }`}
                  >
                    {change.direction === 'up' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : change.direction === 'down' ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    <span>{change.label}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80 ring-1 ring-inset ring-white/15">
                    <Sparkles className="h-3 w-3" />
                    {t.home.market.fresh}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    );
  }, [loading, markets, t]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/70 sm:text-[13px]">
            {t.dashboard.market.kicker}
          </p>
          <p className="text-sm text-white/60">{t.home.market.copy}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadMarkets}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{t.dashboard.market.refresh}</span>
          </button>
          <Link
            href="/trade/spot"
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 ring-1 ring-inset ring-white/10 transition hover:-translate-y-[1px] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {t.dashboard.market.tradeCta}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-white/70 ring-1 ring-inset ring-white/10 sm:px-4">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]" />
          {t.home.market.stats.live}
        </span>
        <span className="flex items-center gap-2 text-white/60">
          <Sparkles className="h-4 w-4" />
          {latestUpdateLabel}
        </span>
      </div>
      {error && !loading && <p className="text-sm text-rose-200/90">{error}</p>}
      {content}
    </section>
  );
}
