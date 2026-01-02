'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpRight, RefreshCw, Sparkles } from 'lucide-react';
import { apiFetch } from '../../app/lib/api';
import { dict, useLang } from '../../app/lib/i18n';

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
};

function formatUsdCompact(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (value > 0.0001) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  if (value > 0) return '<$0.0001';
  return '$0.00';
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

function MarketSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 shadow-inner shadow-black/30 sm:p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold uppercase text-white/60 sm:h-11 sm:w-11">
          {symbol}
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 rounded bg-white/10 sm:w-24" />
          <div className="h-3 w-14 rounded bg-white/10 sm:w-16" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-4 w-16 rounded bg-white/10 sm:w-20" />
        <div className="h-4 w-12 rounded bg-white/10 sm:w-14" />
      </div>
    </div>
  );
}

function TokenAvatar({ symbol, label, logoUrl }: { symbol: string; label: string; logoUrl?: string | null }) {
  const src = logoUrl || FALLBACK_LOGOS[symbol.toUpperCase()];
  return (
    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-xs font-bold uppercase tracking-tight text-white ring-1 ring-inset ring-white/15 sm:h-11 sm:w-11">
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
    setMarkets(res.data.markets || []);
    setLoading(false);
  }, [t.common.genericError]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {markets.map((marketRaw) => {
          const market = {
            ...marketRaw,
            logoUrl: marketRaw.logoUrl || FALLBACK_LOGOS[marketRaw.symbol.toUpperCase()],
          };
          const change = formatChange(market.change24h ?? null);
          const sourceLabel = t.home.market.sourceLabel[market.source] ?? t.home.market.sourceLabel.unknown;
          return (
            <div
              key={market.symbol}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-2.5 shadow-lg shadow-black/25 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-white/20 hover:ring-white/15 sm:p-3"
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="absolute -left-12 -top-16 h-24 w-24 rounded-full bg-amber-400/10 blur-3xl" />
                <div className="absolute -right-14 -bottom-16 h-28 w-28 rounded-full bg-emerald-400/10 blur-3xl" />
              </div>
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <TokenAvatar symbol={market.symbol} label={market.label} logoUrl={market.logoUrl} />
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-semibold leading-tight text-white sm:text-sm">{market.label}</p>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/60">{market.symbol}</p>
                  </div>
                </div>
                {change ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold shadow-inner shadow-black/30 ring-1 ring-inset ${{
                      up: 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/30',
                      down: 'bg-rose-500/15 text-rose-100 ring-rose-500/30',
                      flat: 'bg-white/10 text-white/80 ring-white/15',
                    }[change.direction]}`}
                  >
                    {change.direction === 'up' ? <ArrowUp className="h-3 w-3" /> : change.direction === 'down' ? <ArrowDown className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                    <span>{change.label}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/80 ring-1 ring-inset ring-white/10">
                    <Sparkles className="h-3 w-3" />
                    {t.home.market.fresh}
                  </span>
                )}
              </div>

              <div className="relative mt-3 flex items-end justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-lg font-semibold leading-tight text-white sm:text-xl">
                    {formatUsdCompact(market.priceUsd)}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">{sourceLabel}</p>
                </div>
                <Link
                  href="/trade/spot"
                  className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-[11px] font-semibold text-white shadow-sm shadow-black/20 ring-1 ring-inset ring-white/10 transition hover:-translate-y-[1px] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  {t.dashboard.market.tradeCta}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [loading, markets, t.dashboard.market.empty, t.dashboard.market.tradeCta, t.home.market.fresh, t.home.market.sourceLabel]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/70 sm:text-[13px]">
          {t.dashboard.market.kicker}
        </p>
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
      {error && !loading && <p className="text-sm text-rose-200/90">{error}</p>}
      {content}
    </section>
  );
}
