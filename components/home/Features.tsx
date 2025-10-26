'use client';

import { Shield, Zap, Network, Coins } from 'lucide-react';
import { motion } from 'framer-motion';


const data = [
  { icon: Shield, title: 'Secure', desc: 'Audited smart contracts keep your assets safe.' },
  { icon: Zap, title: 'Fast', desc: 'Instant transactions with low fees.' },
  { icon: Network, title: 'Cross-chain Ready', desc: 'Built for interoperability across blockchains.' },
  { icon: Coins, title: 'Earn', desc: 'Stake and grow your holdings.' },
];

export default function Features() {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-black via-fuchsia-900/20 to-black">
      <h2 className="text-3xl font-bold text-center mb-12">Why ELTX?</h2>
      <div className="grid gap-8 sm:grid-cols-2 max-w-6xl mx-auto">
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
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-600 shadow-lg"
            >
              <div className="h-full p-6 rounded-2xl bg-black/60 text-center backdrop-blur-xl border border-white/10">
                <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center shadow">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{d.title}</h3>
                <p className="text-sm opacity-80">{d.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
