'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../../app/lib/auth';

export default function Hero() {
  const { user } = useAuth();
  const primaryHref = user ? '/dashboard' : '/signup';
  const primaryLabel = user ? 'Dashboard' : 'افتح حساب / سجّل الدخول';
  const secondaryHref = '#swap-eltx';
  const [logoError, setLogoError] = useState(false);
  return (
    <section className="relative overflow-hidden text-white py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.08),_transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-cyan-500/10 animate-pulse" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-purple-700 via-fuchsia-600 to-cyan-500 opacity-50 animate-gradient-slow" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent)]" />
      <div className="absolute -top-24 -left-24 w-80 h-80 bg-purple-600/30 rounded-full blur-3xl animate-blob" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-cyan-600/30 rounded-full blur-3xl animate-blob animation-delay-2000" />
      <div className="absolute top-1/2 -left-32 w-80 h-80 bg-fuchsia-500/20 rounded-full blur-3xl animate-blob animation-delay-4000" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 grid gap-10 md:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="space-y-6 text-center md:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Trusted Crypto Protocol</span>
          </div>
          <div className="flex flex-col items-center md:items-start gap-3">
            {!logoError ? (
              <Image
                src="/assets/img/logo.jpeg"
                alt="ELTX Logo"
                width={96}
                height={96}
                className="rounded-2xl shadow-lg shadow-purple-900/40"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="text-5xl font-extrabold">ELTX</div>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl md:text-5xl font-extrabold leading-tight bg-gradient-to-r from-purple-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent"
            >
              ELTX Platform
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="opacity-90 text-base md:text-lg max-w-2xl"
            >
              Secure, fast and cross-chain ready digital asset platform.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start"
          >
            <Link
              href={primaryHref}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-cyan-500 text-white font-semibold shadow-lg shadow-purple-900/40 hover:opacity-90 hover:scale-[1.01] transition-transform"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="px-6 py-3 rounded-full border border-white/15 bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
            >
              اشترِ ELTX الآن
            </Link>
          </motion.div>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 text-xs md:text-sm opacity-90">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">Secure</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">Fast</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">Cross-chain Ready</span>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 space-y-4 shadow-lg shadow-purple-900/20">
          <h3 className="text-lg font-semibold text-left">ما الذي ستحصل عليه؟</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Dashboard</p>
              <p className="text-white/80 mt-1">أداة موحدة لمراقبة الأصول والتحركات.</p>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Wallet</p>
              <p className="text-white/80 mt-1">عمليات سريعة مع تجربة مبسطة للهاتف.</p>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Staking</p>
              <p className="text-white/80 mt-1">فرص نمو واضحة مع أدوات الحوكمة.</p>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Support</p>
              <p className="text-white/80 mt-1">دعم سريع لمساعدتك في كل خطوة.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

