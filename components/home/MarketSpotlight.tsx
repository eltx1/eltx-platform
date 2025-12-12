'use client';

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

const COIN_BRANDING: Record<
  string,
  { gradient: string; ring: string; glyph?: string; image?: string; textClass?: string }
> = {
  ELTX: {
    gradient: 'from-purple-500 via-fuchsia-500 to-cyan-400',
    ring: 'shadow-purple-500/50',
    image: '/assets/img/logo.jpeg',
  },
  BTC: {
    gradient: 'from-amber-500 via-orange-500 to-yellow-400',
    ring: 'shadow-amber-500/50',
    glyph: '₿',
    textClass: 'text-amber-50',
  },
  ETH: {
    gradient: 'from-slate-400 via-indigo-400 to-purple-500',
    ring: 'shadow-indigo-500/40',
    glyph: '⬢',
    textClass: 'text-slate-50',
  },
  BNB: {
    gradient: 'from-yellow-300 via-amber-400 to-orange-500',
    ring: 'shadow-yellow-400/50',
    glyph: '◆',
    textClass: 'text-amber-900',
  },
  SOL: {
    gradient: 'from-emerald-400 via-teal-300 to-purple-400',
    ring: 'shadow-emerald-500/40',
    glyph: 'S',
    textClass: 'text-emerald-50',
  },
};

function CoinAvatar({ symbol }: { symbol: string }) {
  const branding = COIN_BRANDING[symbol] ?? {
    gradient: 'from-slate-600 via-slate-700 to-slate-900',
    ring: 'shadow-black/40',
    glyph: symbol?.[0] ?? '?',
    textClass: 'text-white',
  };

  return (
    <div
      className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${branding.gradient} shadow-lg ${branding.ring}`}
    >
      <div className="absolute inset-0 opacity-70" />
      {branding.image ? (
        <Image
          src={branding.image}
          alt={`${symbol} logo`}
          width={48}
          height={48}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={`relative text-lg font-bold drop-shadow ${branding.textClass ?? 'text-white'}`}>
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
    <section className="relative overflow-hidden bg-[#040508] py-16 px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(122,69,255,0.22),transparent_35%),_radial-gradient(circle_at_80%_10%,rgba(0,204,255,0.18),transparent_38%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 opacity-60" />
      <div className="relative mx-auto max-w-6xl space-y-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-50">
              <Sparkles className="h-3.5 w-3.5" />
              {t.home.market.eyebrow}
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold md:text-4xl">{t.home.market.title}</h2>
              <p className="max-w-2xl text-sm text-white/70 md:text-base">{t.home.market.copy}</p>
            </div>
          </div>
          <Link
            href={appLink}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:scale-[1.02]"
          >
            <Download className="h-4 w-4" />
            <span>{t.home.market.cta}</span>
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((item) => {
            const changeLabel = formatChange(item.change24h);
            const isUp = (item.change24h ?? 0) >= 0;
            return (
              <div
                key={item.symbol}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/0 to-white/5 p-4 shadow-xl shadow-black/30 transition hover:-translate-y-1"
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="absolute -right-12 -top-16 h-32 w-32 rounded-full bg-cyan-500/15 blur-2xl" />
                  <div className="absolute -left-12 -bottom-10 h-28 w-28 rounded-full bg-purple-600/20 blur-2xl" />
                </div>
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CoinAvatar symbol={item.symbol} />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-white/60">{item.symbol}</p>
                    </div>
                  </div>
                  {changeLabel ? (
                    <div
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold shadow-inner shadow-black/30 ${
                        isUp ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'
                      }`}
                    >
                      {isUp ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      <span>{changeLabel}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{t.home.market.fresh}</span>
                    </div>
                  )}
                </div>
                <div className="relative mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold md:text-2xl">{formatUsd(item.priceUsd)}</p>
                    <p className="text-xs text-white/60">{t.home.market.sourceLabel[item.source] ?? t.home.market.sourceLabel.unknown}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right text-[11px] text-white/60">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 font-semibold uppercase tracking-[0.18em] text-white/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-purple-400 to-cyan-300" />
                      Live
                    </span>
                    <span className="text-[10px] text-white/50">{t.home.app.short}</span>
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
