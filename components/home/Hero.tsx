'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '../../app/lib/auth';
import { ArrowRight, LogIn, Sparkles, UserPlus } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

export default function Hero() {
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang].home.hero;
  const signupHref = user ? '/dashboard' : '/signup';
  const loginHref = user ? '/dashboard' : '/login';

  return (
    <section className="relative overflow-hidden border-b border-[#2f3336] py-14 text-white md:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_12%,rgba(29,155,240,0.22),transparent_32%),radial-gradient(circle_at_86%_14%,rgba(123,97,255,0.18),transparent_30%)]" />
      <div className="relative z-10 mx-auto grid max-w-6xl items-start gap-8 px-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-3 py-1 text-xs uppercase tracking-[0.24em]">
            <span className="h-2 w-2 rounded-full bg-[#c9a75c]" />
            <span>{t.badge}</span>
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl"
          >
            {t.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="max-w-2xl text-base text-white/85 md:text-lg"
          >
            {t.description}
          </motion.p>

          <div className="grid gap-3 sm:grid-cols-3">
            {t.highlights.map((item) => (
              <div key={item.title} className="rounded-2xl border border-[#2f3336] bg-[#101215] p-4">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-white/70">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <motion.aside
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="x-card space-y-4 p-6"
        >
          <h2 className="text-xl font-semibold">{t.cardTitle}</h2>
          <p className="text-sm text-white/75">{t.cardSubtitle}</p>
          <div className="space-y-3">
            <Link href={signupHref} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a75c] px-6 py-3 text-sm font-semibold hover:brightness-110">
              <UserPlus className="h-4 w-4" />
              <span>{user ? t.goDashboard : t.createAccount}</span>
              <Sparkles className="h-4 w-4" />
            </Link>
            <Link href={loginHref} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-6 py-3 text-sm font-semibold hover:bg-[#1d1f23]">
              <LogIn className="h-4 w-4" />
              <span>{user ? t.returnAccount : t.signIn}</span>
            </Link>
          </div>
          <div className="rounded-2xl border border-[#2f3336] bg-[#101215] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">{t.livePreviewLabel}</p>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {t.feedPreview.map((line) => (
                <li key={line} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                  <span>{line}</span>
                  <ArrowRight className="h-4 w-4 text-white/60" />
                </li>
              ))}
            </ul>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}
