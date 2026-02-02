'use client';

import { motion } from 'framer-motion';
import SectionCta from './SectionCta';

const phases = [
  {
    title: 'Phase 1: Launch',
    points: ['Social profiles & posting', 'Community channels open', 'Initial creator rewards'],
  },
  {
    title: 'Phase 2: Platform',
    points: ['Staking and governance', 'AI assistant beta', 'Realtime chat'],
  },
  {
    title: 'Phase 3: Expansion',
    points: ['Marketplace & P2P trading', 'Advanced feeds', 'Mobile experience'],
  },
];

export default function Roadmap() {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-black via-purple-900/20 to-black">
      <h2 className="text-3xl font-bold text-center mb-12">Roadmap</h2>
      <div className="max-w-4xl mx-auto relative">
        <div className="absolute left-4 top-0 bottom-0 border-l border-white/20" />
        <div className="space-y-8">
          {phases.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ x: 4 }}
              className="relative pl-12"
            >
              <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h3 className="font-semibold mb-2">{p.title}</h3>
                <ul className="text-sm opacity-80 space-y-1 list-disc ml-4">
                  {p.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="max-w-4xl mx-auto mt-12 px-4">
        <SectionCta
          eyebrow="Next steps"
          title="Move with our roadmap"
          copy="Create a LordAi.Net account to experience each phase as it ships, or sign in to track your progress across launches."
        />
      </div>
    </section>
  );
}
