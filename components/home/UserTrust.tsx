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
    <section className="relative overflow-hidden bg-gradient-to-b from-[#050509] via-[#0b0f1c] to-[#050509] px-4 py-14 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-16 top-6 h-48 w-48 rounded-full bg-purple-700/25 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_55%)]" />
      </div>
      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="overflow-hidden rounded-3xl border border-white/10 bg-black/60 shadow-2xl shadow-purple-900/40 backdrop-blur-xl"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400" />
          <div className="grid items-center gap-8 px-6 py-8 md:grid-cols-[1.1fr_0.9fr] md:px-10">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-purple-100/80">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  {t.home.trust.eyebrow}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/40 bg-amber-200/10 px-3 py-1 font-semibold text-amber-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t.home.trust.verifiedUsersLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-white/80">
                  {t.home.trust.growthBadge}
                </span>
              </div>
              <div className="space-y-3 rounded-3xl border border-white/5 bg-gradient-to-br from-purple-600/15 via-fuchsia-600/10 to-cyan-500/10 p-6 shadow-inner shadow-black/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">{t.home.trust.headline}</p>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="bg-gradient-to-r from-purple-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-4xl font-black text-transparent drop-shadow-sm md:text-5xl">
                        {displayValue}+
                      </span>
                      <p className="text-base text-white/75 md:text-lg">{t.home.trust.subtitle}</p>
                    </div>
                  </div>
                  <div className="hidden h-16 w-px bg-gradient-to-b from-white/10 via-white/40 to-white/10 md:block" />
                  <div className="flex flex-col items-end gap-2 text-right text-sm text-white/70">
                    <p className="max-w-xs text-justify text-xs leading-relaxed text-white/65 md:text-sm md:leading-snug">
                      {t.home.trust.copy}
                    </p>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                      {t.home.trust.badges[0]}
                    </div>
                  </div>
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
              <div className="flex flex-wrap gap-2">
                {t.home.trust.badges.slice(1).map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-purple-400 to-cyan-300" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
              {t.home.trust.metrics.map((item) => (
                <div
                  key={item.label}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-400/10" />
                  <div className="relative space-y-1">
                    <p className="text-2xl font-bold leading-tight text-white">{item.value}</p>
                    <p className="text-sm text-white/80">{item.label}</p>
                    <p className="text-xs text-white/60 line-clamp-2">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
