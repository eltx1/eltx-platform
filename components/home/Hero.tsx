'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { useAuth } from '../../app/lib/auth';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { useEffect, useMemo } from 'react';
import { loadSlim } from '@tsparticles/slim';

export default function Hero() {
  const { user } = useAuth();
  const primaryHref = user ? '/dashboard' : '/signup';
  const primaryLabel = user ? 'Dashboard' : 'Get Started';
  const [logoError, setLogoError] = useState(false);
  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }, []);
  const options = useMemo(
    () => ({
      fullScreen: false,
      background: { color: 'transparent' },
      particles: {
        number: { value: 40 },
        color: { value: '#a855f7' },
        links: { enable: true, color: '#a855f7', opacity: 0.4 },
        move: { enable: true, speed: 0.6 },
        opacity: { value: 0.5 },
        size: { value: { min: 1, max: 3 } },
      },
    }),
    []
  );

  return (
    <section className="relative overflow-hidden text-white py-24 text-center">
      <Particles id="hero-particles" options={options} className="absolute inset-0 -z-10" />
      <div className="absolute inset-0 bg-gradient-to-br from-purple-700 via-fuchsia-600 to-cyan-500 opacity-50 animate-gradient-slow" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent)]" />
      <div className="absolute -top-24 -left-24 w-80 h-80 bg-purple-600/30 rounded-full blur-3xl animate-blob" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-cyan-600/30 rounded-full blur-3xl animate-blob animation-delay-2000" />
      <div className="absolute top-1/2 -left-32 w-80 h-80 bg-fuchsia-500/20 rounded-full blur-3xl animate-blob animation-delay-4000" />
      <div className="relative z-10 max-w-2xl mx-auto px-4 space-y-6">
        {!logoError ? (
          <Image
            src="/assets/img/logo.jpeg"
            alt="ELTX Logo"
            width={96}
            height={96}
            className="mx-auto"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="text-6xl font-bold">ELTX</div>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-extrabold bg-gradient-to-r from-purple-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent"
        >
          ELTX Platform
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="opacity-90"
        >
          Secure, fast and cross-chain ready digital asset platform.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex justify-center"
        >
          <Link
            href={primaryHref}
            className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 text-black font-semibold hover:opacity-90"
          >
            {primaryLabel}
          </Link>
        </motion.div>
        <div className="flex justify-center gap-2 text-xs opacity-80">
          <span>Secure</span>
          <span>•</span>
          <span>Fast</span>
          <span>•</span>
          <span>Cross-chain Ready</span>
        </div>
      </div>
    </section>
  );
}

