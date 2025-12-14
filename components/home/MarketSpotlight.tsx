'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Download, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { dict, useLang } from '../../app/lib/i18n';
import type { HomeMarketEntry } from '../../app/lib/home-data';

function formatUsd(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChange(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const fixed = value.toFixed(2);
  return `${fixed}%`;
}

const COIN_BRANDING: Record<string, { gradient: string; ring: string; glyph?: string; fallbackImage?: string; textClass?: string }> = {
  ELTX: {
    gradient: 'from-purple-500 via-fuchsia-500 to-cyan-400',
    ring: 'shadow-purple-500/50',
    fallbackImage: '/assets/img/logo.jpeg',
  },
  BTC: {
    gradient: 'from-amber-500 via-orange-500 to-yellow-400',
    ring: 'shadow-amber-500/50',
    textClass: 'text-amber-50',
  },
  ETH: {
    gradient: 'from-slate-400 via-indigo-400 to-purple-500',
    ring: 'shadow-indigo-500/40',
    textClass: 'text-slate-50',
  },
  BNB: {
    gradient: 'from-yellow-300 via-amber-400 to-orange-500',
    ring: 'shadow-yellow-400/50',
    textClass: 'text-amber-900',
  },
  SOL: {
    gradient: 'from-emerald-400 via-teal-300 to-purple-400',
    ring: 'shadow-emerald-500/40',
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

  const displayImage = !broken ? logoUrl ?? branding.fallbackImage : undefined;

  return (
    <div
      className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br md:h-11 md:w-11 md:rounded-2xl ${branding.gradient} shadow-lg ${branding.ring}`}
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

export default function MarketSpotlight({ markets }: { markets: HomeMarketEntry[] }) {
  const { lang } = useLang();
  const t = dict[lang];
  const appLink = t.home.app.downloadUrl;

  return (
    <section className="relative overflow-hidden bg-[#040508] py-10 px-3 text-white md:py-14 md:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(122,69,255,0.22),transparent_35%),_radial-gradient(circle_at_80%_10%,rgba(0,204,255,0.18),transparent_38%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 opacity-60" />
      <div className="relative mx-auto max-w-5xl space-y-6 md:space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
          <div className="space-y-2.5 md:space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-purple-50 md:gap-2 md:text-[11px]">
              <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5" />
              {t.home.market.eyebrow}
            </div>
            <div className="space-y-1.5 md:space-y-2">
              <h2 className="text-2xl font-bold md:text-3xl">{t.home.market.title}</h2>
              <p className="max-w-2xl text-xs text-white/70 md:text-sm">{t.home.market.copy}</p>
            </div>
          </div>
          <Link
            href={appLink}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-400 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:scale-[1.02] md:px-5 md:py-3 md:text-sm"
          >
            <Download className="h-4 w-4" />
            <span>{t.home.market.cta}</span>
          </Link>
        </div>
        <div className="grid gap-3 md:gap-4">
          {markets.map((item) => {
            const changeLabel = formatChange(item.change24h);
            const isUp = (item.change24h ?? 0) >= 0;
            return (
              <div
                key={item.symbol}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/0 to-white/5 px-3 py-2.5 shadow-lg shadow-black/30 transition hover:-translate-y-0.5 md:px-4 md:py-3"
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="absolute -right-12 -top-16 h-32 w-32 rounded-full bg-cyan-500/15 blur-2xl" />
                  <div className="absolute -left-12 -bottom-10 h-28 w-28 rounded-full bg-purple-600/20 blur-2xl" />
                </div>
                <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                  <div className="flex flex-1 items-center gap-3 md:gap-4">
                    <CoinAvatar symbol={item.symbol} logoUrl={item.logoUrl} />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-white md:text-base">{item.label}</p>
                      <p className="text-[10px] uppercase tracking-[0.28em] text-white/60 md:text-[11px]">{item.symbol}</p>
                    </div>
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-2 md:justify-end md:gap-4">
                    <div className="text-left md:text-right">
                      <p className="text-lg font-bold md:text-xl">{formatUsd(item.priceUsd)}</p>
                      <p className="text-[11px] text-white/60 md:text-xs">{t.home.market.sourceLabel[item.source] ?? t.home.market.sourceLabel.unknown}</p>
                    </div>
                    {changeLabel ? (
                      <div
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-inner shadow-black/30 ${
                          isUp ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'
                        }`}
                      >
                        {isUp ? <ArrowUp className="h-3.5 w-3.5 md:h-4 md:w-4" /> : <ArrowDown className="h-3.5 w-3.5 md:h-4 md:w-4" />}
                        <span>{changeLabel}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t.home.market.fresh}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
