'use client';

import { ShieldCheck, Sparkles, Gauge, Expand } from 'lucide-react';
import SectionCta from './SectionCta';

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Security first',
    copy: 'Secure infrastructure reinforced by audited smart contracts.',
  },
  {
    icon: Sparkles,
    title: 'Easy experience',
    copy: 'Simple journeys for opening accounts, managing wallets and sending value.',
  },
  {
    icon: Gauge,
    title: 'Fast performance',
    copy: 'Optimized for instant confirmations and smooth on-chain interactions.',
  },
  {
    icon: Expand,
    title: 'Built to scale',
    copy: 'Cross-chain ready architecture prepared for new networks and future upgrades.',
  },
];

export default function About() {
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-purple-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-3 text-center md:text-left md:space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/80">About ELTX</p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
            Built for a secure, fast and cross-chain ready digital asset future.
          </h2>
          <p className="text-base md:text-lg text-white/80 max-w-3xl mx-auto md:mx-0">
            ELTX keeps every flow simple—from dashboards and wallets to conversions—while maintaining
            enterprise-grade security and speed.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-purple-900/10 backdrop-blur-sm p-5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold text-lg">{pillar.title}</h3>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{pillar.copy}</p>
              </div>
            );
          })}
        </div>
        <SectionCta
          eyebrow="Join ELTX"
          title="Create your profile in minutes"
          copy="Open an account and get instant access to dashboards, wallets, and secure swaps. Already with us? Sign in to continue where you left off."
        />
      </div>
    </section>
  );
}

