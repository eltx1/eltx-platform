'use client';

import { Shield, Zap, Network, Coins } from 'lucide-react';

const data = [
  { icon: Shield, title: 'Secure', desc: 'Audited smart contracts keep your assets safe.' },
  { icon: Zap, title: 'Fast', desc: 'Instant transactions with low fees.' },
  { icon: Network, title: 'Cross-chain Ready', desc: 'Built for interoperability across blockchains.' },
  { icon: Coins, title: 'Earn', desc: 'Stake and grow your holdings.' },
];

export default function Features() {
  return (
    <section className="py-16 px-4">
      <h2 className="text-2xl font-bold text-center mb-8">Why ELTX?</h2>
      <div className="grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
        {data.map((d) => {
          const Icon = d.icon;
          return (
            <div
              key={d.title}
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-600 hover:translate-y-0.5 transition-transform"
            >
              <div className="h-full p-6 rounded-2xl bg-black/80 text-center backdrop-blur">
                <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{d.title}</h3>
                <p className="text-sm opacity-80">{d.desc}</p>
              </div>

            </div>
          );
        })}
      </div>
    </section>
  );
}
