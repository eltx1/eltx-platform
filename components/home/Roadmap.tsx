'use client';

import { motion } from 'framer-motion';

const phases = [
  {
    title: 'Phase 1: Launch',
    points: ['Token genesis and airdrops', 'Community channels open', 'Initial listing'],
  },
  {
    title: 'Phase 2: Platform',
    points: ['Staking and governance', 'AI assistant beta', 'Tribe competitions'],
  },
  {
    title: 'Phase 3: Expansion',
    points: ['Marketplace & P2P trading', 'Cross-chain bridges', 'Mobile experience'],
  },
];

export default function Roadmap() {
  return (
    <section className="py-16 px-4">
      <h2 className="text-2xl font-bold text-center mb-8">Roadmap</h2>
      <div className="max-w-3xl mx-auto relative">
        <div className="absolute left-4 top-0 bottom-0 border-l border-white/20" />
        <div className="space-y-8">
          {phases.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative pl-12"
            >
              <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <h3 className="font-semibold mb-2">{p.title}</h3>
              <ul className="text-sm opacity-80 space-y-1 list-disc ml-4">
                {p.points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
