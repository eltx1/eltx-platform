'use client';

import { ArrowDown, ArrowUp, Download, Sparkles } from 'lucide-react';
import Link from 'next/link';
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

export default function MarketSpotlight({ markets }: { markets: HomeMarketEntry[] }) {
  const { lang } = useLang();
  const t = dict[lang];
  const appLink = t.home.app.downloadUrl;

  return (
    <section className="py-16 px-4 bg-black text-white">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">{t.home.market.eyebrow}</p>
            <h2 className="text-3xl font-bold">{t.home.market.title}</h2>
            <p className="text-white/70 text-sm md:text-base max-w-2xl">{t.home.market.copy}</p>
          </div>
          <Link
            href={appLink}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/60 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-50 shadow-lg shadow-cyan-900/30 hover:scale-105 transition"
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
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-purple-900/10 backdrop-blur"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 via-transparent to-cyan-500/10" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-semibold">
                        {item.symbol}
                      </div>
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-white/80">{item.symbol}</p>
                        <p className="text-base font-semibold text-white">{item.label}</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatUsd(item.priceUsd)}</p>
                    <p className="text-xs text-white/70">{t.home.market.sourceLabel[item.source] ?? t.home.market.sourceLabel.unknown}</p>
                  </div>
                  {changeLabel ? (
                    <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${isUp ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'}`}>
                      {isUp ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      <span>{changeLabel}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{t.home.market.fresh}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
