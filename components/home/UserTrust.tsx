'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo } from 'react';
import { dict, useLang } from '../../app/lib/i18n';
import { ArrowUpRight, Download, ShieldCheck } from 'lucide-react';

function formatUsers(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function UserTrust({ userCount }: { userCount: number }) {
  const { lang } = useLang();
  const t = dict[lang];
  const displayValue = useMemo(() => formatUsers(userCount), [userCount]);
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-neutral-950 via-[#0a0d1b] to-neutral-950 py-12 px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-48 w-48 rounded-full bg-purple-700/25 blur-3xl" />
        <div className="absolute right-4 bottom-6 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_55%)]" />
      </div>
      <div className="max-w-5xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-white/10 bg-gradient-to-br from-neutral-900/90 via-[#0b1024]/90 to-purple-900/50 p-6 md:p-8 shadow-2xl shadow-purple-900/30 backdrop-blur-xl"
        >
          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] items-center">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.26em] text-purple-100/80">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  {t.home.trust.eyebrow}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/40 bg-amber-200/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t.home.trust.verifiedUsersLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80">
                  {t.home.trust.growthBadge}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white/70">{t.home.trust.headline}</p>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-4xl md:text-5xl font-black bg-gradient-to-r from-purple-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent drop-shadow-sm">
                    {displayValue}+
                  </span>
                  <p className="text-lg md:text-xl text-white/85">{t.home.trust.subtitle}</p>
                </div>
                <p className="text-sm md:text-base text-white/75 max-w-xl leading-relaxed">{t.home.trust.copy}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {t.home.trust.badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    {badge}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={t.home.app.downloadUrl}
                  target="_blank"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:scale-[1.02]"
                >
                  <Download className="h-4 w-4" />
                  <span>{t.home.trust.downloadCta}</span>
                </Link>
                <Link
                  href="/status"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/85 shadow-inner shadow-black/30 transition hover:border-cyan-200/50 hover:text-white"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  <span>{t.home.trust.statusCta}</span>
                </Link>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {t.home.trust.metrics.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left shadow-inner shadow-black/30"
                >
                  <p className="text-2xl font-bold text-white leading-tight">{item.value}</p>
                  <p className="text-sm text-white/80 mt-1">{item.label}</p>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
