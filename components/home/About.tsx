'use client';

import { ShieldCheck, Sparkles, Gauge, Expand } from 'lucide-react';
import SectionCta from './SectionCta';

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Safety by design',
    copy: 'Protected profiles, secure wallets, and audited smart contracts.',
  },
  {
    icon: Sparkles,
    title: 'Social made simple',
    copy: 'Post, share, and chat while your wallet and trading tools stay one tap away.',
  },
  {
    icon: Gauge,
    title: 'Fast performance',
    copy: 'Optimized for instant social interactions and smooth on-chain actions.',
  },
  {
    icon: Expand,
    title: 'Built to scale',
    copy: 'Web3-ready architecture prepared for new communities and future upgrades.',
  },
];

export default function About() {
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-purple-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-3 text-center md:text-left md:space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/80">About LordAi.Net</p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
            The social layer for Web3 creators, traders, and communities.
          </h2>
          <p className="text-base md:text-lg text-white/80 max-w-3xl mx-auto md:mx-0">
            LordAi.Net blends social media, AI assistance, and crypto services so creators can publish,
            chat, earn, and trade in one unified experience.
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
          eyebrow="Join LordAi.Net"
          title="Create your profile in minutes"
          copy="Set up your profile, share your first post, and keep trading, staking, and payments in the same dashboard."
        />
      </div>
    </section>
  );
}
