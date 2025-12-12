'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo } from 'react';
import { dict, useLang } from '../../app/lib/i18n';
import { Download } from 'lucide-react';

function formatUsers(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function UserTrust({ userCount }: { userCount: number }) {
  const { lang } = useLang();
  const t = dict[lang];
  const displayValue = useMemo(() => formatUsers(userCount), [userCount]);
  return (
    <section className="relative py-12 px-4 bg-gradient-to-b from-neutral-950 via-purple-950/30 to-neutral-950 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-10 top-10 h-48 w-48 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-56 w-56 rounded-full bg-cyan-500/25 blur-3xl" />
      </div>
      <div className="max-w-5xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-white/10 bg-gradient-to-r from-purple-700/40 via-fuchsia-600/30 to-cyan-500/30 p-6 md:p-8 shadow-xl"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-purple-100/80">{t.home.trust.eyebrow}</p>
              <div className="flex flex-wrap items-end gap-3">
                <h2 className="text-3xl md:text-4xl font-extrabold leading-tight text-white drop-shadow-sm">
                  {displayValue}+
                </h2>
                <p className="text-base md:text-lg text-white/80">{t.home.trust.subtitle}</p>
              </div>
              <p className="text-sm md:text-base text-white/75 max-w-2xl">{t.home.trust.copy}</p>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <div className="grid grid-cols-2 gap-3">
                {t.home.trust.highlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left shadow-inner shadow-black/20"
                  >
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-white/75 mt-1 leading-relaxed">{item.copy}</p>
                  </div>
                ))}
              </div>
              <Link
                href={t.home.app.downloadUrl}
                target="_blank"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-neutral-900 px-5 py-3 text-sm font-semibold shadow-lg shadow-purple-900/30 hover:scale-[1.02] transition"
              >
                <Download className="h-4 w-4" />
                <span>{t.home.trust.downloadCta}</span>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
