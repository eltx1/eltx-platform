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
            <span>AI-Powered Social Network</span>
          </div>
          <div className="flex flex-col items-center md:items-start gap-3">
            {!logoError ? (
              <Image
                src="/assets/img/logo.jpeg"
                alt="LordAi.Net Logo"
                width={96}
                height={96}
                className="rounded-2xl shadow-lg shadow-purple-900/40"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="text-5xl font-extrabold">LordAi.Net</div>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl md:text-5xl font-extrabold leading-tight bg-gradient-to-r from-purple-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent"
            >
              LordAi.Net : AI Web3 Social Media Network
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="opacity-90 text-base md:text-lg max-w-2xl"
            >
              A social-first Web3 network where you can publish posts, share images, chat, and earn from your content — with trading, staking, payments, and AI tools built in.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="opacity-90 text-base md:text-lg max-w-2xl"
            >
              LordAi.Net منصة سوشيال ميديا مدعومة بالذكاء الاصطناعي لـ Web3: انشر بوستاتك وصورك، اتكلم مع أصحابك، واربح من التفاعل — ومعاك خدمات التداول والاستاكينج والدفع بالعربي والإنجليزي.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center md:justify-start"
          >
            <Link
              href={signupHref}
              className="group relative inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-cyan-500 px-6 py-3 text-base font-semibold shadow-lg shadow-purple-900/50 transition-transform hover:scale-105"
            >
              <span className="absolute inset-0 rounded-full bg-white/15 opacity-0 blur transition-opacity group-hover:opacity-100" />
              <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <UserPlus className="h-4 w-4" />
              </span>
              <span className="relative">{user ? 'Go to dashboard' : 'Create account'}</span>
              <Sparkles className="relative h-4 w-4" />
            </Link>
            <Link
              href={loginHref}
              className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-base font-semibold text-white shadow-inner shadow-black/30 transition hover:border-white/30 hover:bg-white/15"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <LogIn className="h-4 w-4" />
              </span>
              <span>{user ? 'Return to account' : 'Sign in'}</span>
            </Link>
          </motion.div>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 text-xs md:text-sm opacity-90">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">Social-first</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">AI-assisted</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">Web3-ready</span>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 space-y-4 shadow-lg shadow-purple-900/20">
          <h3 className="text-lg font-semibold text-left">What you get</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Social Feed</p>
              <p className="text-white/80 mt-1">Post, react, repost, and connect instantly.</p>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Messaging</p>
              <p className="text-white/80 mt-1">Chat with friends and communities.</p>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">Trading</p>
              <p className="text-white/80 mt-1">Spot, swap, and payments built in.</p>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 to-cyan-500/20 p-4">
              <p className="font-semibold">AI Assistant</p>
              <p className="text-white/80 mt-1">Ask LordAI and get instant answers.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
