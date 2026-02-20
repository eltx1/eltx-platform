'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../../app/lib/auth';
import { LogIn, Sparkles, UserPlus } from 'lucide-react';

export default function Hero() {
  const { user } = useAuth();
  const signupHref = user ? '/dashboard' : '/signup';
  const loginHref = user ? '/dashboard' : '/login';
  const [logoError, setLogoError] = useState(false);
  return (
    <section className="relative overflow-hidden border-b border-[#2f3336] py-20 text-white md:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_8%,rgba(29,155,240,0.16),transparent_28%),radial-gradient(circle_at_84%_12%,rgba(123,97,255,0.13),transparent_25%)]" />
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 text-center md:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-3 py-1 text-xs uppercase tracking-[0.24em]">
            <span className="h-2 w-2 rounded-full bg-[#c9a75c]" />
            <span>Modern social trading</span>
          </div>
          <div className="flex flex-col items-center gap-3 md:items-start">
            {!logoError ? (
              <Image
                src="/assets/img/logo-new.svg"
                alt="ELTX platform logo"
                width={88}
                height={88}
                className="rounded-2xl border border-[#2f3336]"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="text-5xl font-extrabold">LordAi.Net</div>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl font-extrabold leading-tight md:text-5xl"
            >
              Rebuilt with an X-inspired UI for social + Web3 workflows.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="max-w-2xl text-base opacity-90 md:text-lg"
            >
              Timeline feeling, cleaner rails, modern cards, and faster actions for wallet, trade, AI, and community.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="max-w-2xl text-base opacity-90 md:text-lg"
            >
              تصميم جديد قريب من X بشكل مودرن مع الحفاظ على العربي والإنجليزي والتنقل السريع بين كل خدمات المنصة.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap justify-center gap-3 md:justify-start"
          >
            <Link href={signupHref} className="inline-flex items-center gap-2 rounded-full bg-[#c9a75c] px-6 py-3 text-base font-semibold hover:brightness-110">
              <UserPlus className="h-4 w-4" />
              <span>{user ? 'Go to dashboard' : 'Create account'}</span>
              <Sparkles className="h-4 w-4" />
            </Link>
            <Link href={loginHref} className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-6 py-3 text-base font-semibold hover:bg-[#1d1f23]">
              <LogIn className="h-4 w-4" />
              <span>{user ? 'Return to account' : 'Sign in'}</span>
            </Link>
          </motion.div>
        </div>
        <div className="x-card space-y-4 p-6">
          <h3 className="text-left text-lg font-semibold">What you get</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {['Social Feed', 'Messaging', 'Trading', 'AI Assistant'].map((item) => (
              <div key={item} className="rounded-xl border border-[#2f3336] bg-[#111] p-4">
                <p className="font-semibold">{item}</p>
                <p className="mt-1 text-white/70">Faster and cleaner UX in the new design layer.</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
