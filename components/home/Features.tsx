'use client';

import { Shield, Zap, Network, Coins, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import SectionCta from './SectionCta';


const data = [
  { icon: MessageCircle, title: 'Social-first', desc: 'Post, share, and chat with your Web3 community.' },
  { icon: Shield, title: 'Secure', desc: 'Audited smart contracts keep your assets safe.' },
  { icon: Zap, title: 'Fast', desc: 'Instant interactions and transactions with low fees.' },
  { icon: Coins, title: 'Earn', desc: 'Monetize content and grow with staking rewards.' },
];

export default function Features() {
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-fuchsia-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">Features</p>
          <h2 className="text-3xl font-bold">Why LordAi.Net?</h2>
          <p className="text-white/70 text-sm md:text-base">
            Social experiences first, with powerful trading and wallet features right beside them.
          </p>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 max-w-6xl mx-auto mt-8">
        {data.map((d, i) => {
          const Icon = d.icon;
          return (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600/80 to-cyan-600/80 shadow-lg"
            >
              <div className="h-full p-6 rounded-2xl bg-black/70 text-left backdrop-blur-xl border border-white/10 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center shadow">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg">{d.title}</h3>
                </div>
                <p className="text-sm opacity-80 leading-relaxed flex-1">{d.desc}</p>
                <div className="text-xs text-white/70">Social feed, trading, wallet, staking & swaps.</div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="max-w-6xl mx-auto px-4 mt-10">
        <SectionCta
          eyebrow="Social onboarding"
          title="Ready to try LordAi.Net?"
          copy="Create your profile, publish your first post, and keep trading, staking, and payments all in one place."
        />
      </div>
    </section>
  );
}
