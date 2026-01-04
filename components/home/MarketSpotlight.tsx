'use client';

import { useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Download, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { dict, useLang } from '../../app/lib/i18n';
import type { HomeMarketEntry } from '../../app/lib/home-data';
import { PLATFORM_LOGO_URL } from '../../app/lib/branding';
import { resolveSpotMarketSymbol } from '../trade/utils';

function formatUsd(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (abs >= 0.01) return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (abs >= 0.0001) return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  if (abs > 0) return `${sign}<$0.0001`;
  return '$0.00';
}

function formatChange(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const fixed = value.toFixed(2);
  return `${fixed}%`;
}

const COIN_BRANDING: Record<
  string,
  { gradient: string; ring: string; glyph?: string; fallbackImage?: string; textClass?: string; image?: string }
> = {
  ELTX: {
    gradient: 'from-purple-500 via-fuchsia-500 to-cyan-400',
    ring: 'shadow-purple-500/50',
    fallbackImage: PLATFORM_LOGO_URL,
  },
  BTC: {
    gradient: 'from-amber-500 via-orange-500 to-yellow-400',
    ring: 'shadow-amber-500/50',
    image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    textClass: 'text-amber-50',
  },
  ETH: {
    gradient: 'from-slate-400 via-indigo-400 to-purple-500',
    ring: 'shadow-indigo-500/40',
    image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    textClass: 'text-slate-50',
  },
  BNB: {
    gradient: 'from-yellow-300 via-amber-400 to-orange-500',
    ring: 'shadow-yellow-400/50',
    image: 'https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png',
    textClass: 'text-amber-900',
  },
  SOL: {
    gradient: 'from-emerald-400 via-teal-300 to-purple-400',
    ring: 'shadow-emerald-500/40',
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    textClass: 'text-emerald-50',
  },
};

function CoinAvatar({ symbol, logoUrl }: { symbol: string; logoUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  const branding = COIN_BRANDING[symbol] ?? {
    gradient: 'from-slate-600 via-slate-700 to-slate-900',
    ring: 'shadow-black/40',
    glyph: symbol?.[0] ?? '?',
    textClass: 'text-white',
  };

  const displayImage = !broken ? logoUrl ?? branding.image ?? branding.fallbackImage : undefined;

  return (
    <div
      className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br md:h-11 md:w-11 ${branding.gradient} shadow-lg ${branding.ring}`}
    >
      <div className="absolute inset-0 opacity-70" />
      {displayImage ? (
        <Image
          src={displayImage}
          alt={`${symbol} logo`}
          width={48}
          height={48}
          className="h-full w-full object-cover"
          sizes="44px"
          unoptimized
          loader={({ src }) => src}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={`relative text-base font-bold drop-shadow md:text-lg ${branding.textClass ?? 'text-white'}`}>
          {branding.glyph ?? symbol}
        </span>
      )}
      <span className="absolute inset-0 rounded-2xl border border-white/10" />
    </div>
  );
}

function ChangeBadge({ value, labelOverride, freshLabel }: { value: number | null | undefined; labelOverride?: string; freshLabel: string }) {
  const label = labelOverride ?? formatChange(value);
  const isUp = (value ?? 0) >= 0;

  if (!label) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80 ring-1 ring-inset ring-white/10">
        <Sparkles className="h-3.5 w-3.5" />
        <span>{freshLabel}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold shadow-inner shadow-black/30 ${
        isUp ? 'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/40' : 'bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/40'
      }`}
    >
      {isUp ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </span>
  );
}

export default function MarketSpotlight({ markets }: { markets: HomeMarketEntry[] }) {
  const { lang } = useLang();
  const t = dict[lang];
  const appLink = t.home.app.downloadUrl;
  const activeSources = useMemo(() => new Set(markets.map((m) => m.source)), [markets]);
  const greenMoves = useMemo(() => markets.filter((m) => (m.change24h ?? 0) > 0).length, [markets]);

  return (
    <section className="relative overflow-hidden bg-[#040508] py-6 px-3 text-white sm:py-7 md:py-10 md:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(122,69,255,0.22),transparent_35%),_radial-gradient(circle_at_80%_10%,rgba(0,204,255,0.18),transparent_38%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 opacity-60" />
      <div className="relative mx-auto max-w-6xl space-y-6 sm:space-y-7 md:space-y-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2.5 md:space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-purple-50 md:gap-2 md:text-[11px]">
                <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5" />
                {t.home.market.eyebrow}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-500/20">
                <Activity className="h-3.5 w-3.5" />
                {t.home.market.layout.liveBadge}
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold leading-tight md:text-4xl">{t.home.market.title}</h2>
              <p className="max-w-2xl text-sm text-white/70 md:text-base">{t.home.market.copy}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-white/70 md:text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-inset ring-white/10">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]" />
                {t.home.market.stats.live}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-inset ring-white/10">
                <Sparkles className="h-3.5 w-3.5" />
                {t.home.market.stats.providers(activeSources.size)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-inset ring-white/10">
                <ArrowUp className="h-3.5 w-3.5 text-emerald-300" />
                {t.home.market.stats.movers(greenMoves)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start rounded-2xl bg-white/5 p-2 ring-1 ring-inset ring-white/10">
            <div className="flex flex-col items-start gap-1 rounded-xl bg-white/5 px-3.5 py-2.5 text-left">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/60">{t.home.market.layout.overviewLabel}</p>
              <p className="text-xl font-semibold text-white">
                {markets.length} {t.home.market.layout.assets}
              </p>
              <p className="text-xs text-white/60">{t.home.market.layout.sourceSafety}</p>
            </div>
            <Link
              href={appLink}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:scale-[1.02] md:px-5"
            >
              <Download className="h-4 w-4" />
              <span>{t.home.market.cta}</span>
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(122,69,255,0.12),transparent_30%),_radial-gradient(circle_at_85%_10%,rgba(59,130,246,0.12),transparent_32%),_linear-gradient(120deg,rgba(255,255,255,0.02),transparent)]" />
          <div className="relative border-b border-white/5 px-3.5 py-2.5 text-[11px] uppercase tracking-[0.26em] text-white/60 md:px-6 md:text-xs">
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-2 md:gap-4">
              <span>{t.home.market.layout.pair}</span>
              <span className="text-right md:text-center">{t.home.market.layout.price}</span>
              <span className="text-right md:text-center">{t.home.market.layout.change}</span>
              <span className="hidden md:block text-right">{t.home.market.layout.source}</span>
            </div>
          </div>
          <div className="relative divide-y divide-white/5">
            {markets.map((item, index) => (
              <Link
                key={item.symbol}
                href={`/trade/spot?market=${encodeURIComponent(resolveSpotMarketSymbol(item.symbol))}`}
                className="group relative grid grid-cols-1 items-center gap-2.5 px-3.5 py-2.5 transition hover:bg-white/[0.04] md:grid-cols-[2fr_1fr_1fr_auto] md:gap-4 md:px-6"
                aria-label={`${item.label} spot market`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <CoinAvatar symbol={item.symbol} logoUrl={item.logoUrl ?? undefined} />
                    {index === 0 && (
                      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-[#040508] bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.28)]" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold md:text-base">{item.label}</p>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/60">{item.symbol}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between md:block">
                  <p className="text-lg font-semibold md:text-xl">{formatUsd(item.priceUsd)}</p>
                  <p className="text-[11px] text-white/50 md:hidden">
                    {t.home.market.sourceLabel[item.source] ?? t.home.market.sourceLabel.unknown}
                  </p>
                </div>
                <div className="flex items-center justify-start md:justify-center">
                  <ChangeBadge value={item.change24h} freshLabel={t.home.market.fresh} />
                </div>
                <div className="hidden items-center justify-end text-xs text-white/60 md:flex">
                  {t.home.market.sourceLabel[item.source] ?? t.home.market.sourceLabel.unknown}
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>{t.home.market.layout.viewMoreHint}</span>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/20 hover:bg-white/10"
          >
            {t.home.market.layout.viewAll}
            <ArrowUp className="h-4 w-4 rotate-90" />
          </Link>
        </div>
      </div>
    </section>
  );
}
