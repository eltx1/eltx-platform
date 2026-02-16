'use client';

import { Building2, Briefcase, User } from 'lucide-react';
import { motion } from 'framer-motion';
import SectionCta from './SectionCta';

const data = [
  {
    icon: Building2,
    title: 'Communities',
    points: ['Public feeds', 'Group chats'],
  },
  {
    icon: Briefcase,
    title: 'Creators',
    points: ['Monetized content', 'Analytics insights'],
  },
  {
    icon: User,
    title: 'Traders',
    points: ['On-chain tools', 'Fast swaps'],
  },
];

export default function Industries() {
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-purple-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-purple-200/70">Reach</p>
          <h2 className="text-3xl font-bold">We serve</h2>
          <p className="text-white/70 text-sm md:text-base">
            Social communities, creators, and traders who want a unified Web3 home.
          </p>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto mt-8">
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
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600/70 to-cyan-600/70 shadow-lg"
            >
              <div className="h-full p-6 rounded-2xl bg-black/70 text-center backdrop-blur-xl border border-white/10 flex flex-col gap-3">
                <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center shadow">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-lg">{d.title}</h3>
                  <ul className="text-sm opacity-80 space-y-1">
                    {d.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="max-w-6xl mx-auto px-4">
        <SectionCta
          title="Choose the LordAi.Net flow that fits you"
          copy="Whether you’re posting daily, trading daily, or both, your profile keeps everything connected."
        />
      </div>
    </section>
  );
}
