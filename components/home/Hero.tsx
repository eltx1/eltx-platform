'use client';

import Link from 'next/link';
import { useAuth } from '../../app/lib/auth';

export default function Hero() {
  const { user } = useAuth();
  const primaryHref = user ? '/dashboard' : '/signup';
  const primaryLabel = user ? 'Dashboard' : 'Get Started';

  return (
    <section className="relative overflow-hidden text-white py-24 text-center">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-violet-600" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent)]" />
      <div className="relative z-10 max-w-2xl mx-auto px-4 space-y-6">
        <h1 className="text-4xl font-bold">ELTX Platform</h1>
        <p className="opacity-90">Secure, fast and cross-chain ready digital asset platform.</p>
        <div className="flex justify-center gap-4">
          <Link
            href={primaryHref}
            className="px-6 py-2 rounded-full bg-white text-black font-semibold hover:opacity-90"
          >
            {primaryLabel}
          </Link>
          <Link
            href="/earn"
            className="px-6 py-2 rounded-full border border-white hover:bg-white/10"
          >
            Explore Earn
          </Link>
        </div>
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

