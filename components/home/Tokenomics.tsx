'use client';

import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

const distribution = [
  { label: 'Community Rewards & Airdrops', percent: 25, color: '#a855f7' },
  { label: 'Staking & Governance', percent: 15, color: '#ec4899' },
  { label: 'Core Team & Advisors', percent: 15, color: '#ef4444' },
  { label: 'Investment Portfolio', percent: 10, color: '#f97316' },
  { label: 'Liquidity', percent: 10, color: '#10b981' },
  { label: 'Platform Development', percent: 10, color: '#3b82f6' },
  { label: 'Marketing & Partnerships', percent: 10, color: '#8b5cf6' },
  { label: 'Reserve & Treasury', percent: 5, color: '#14b8a6' },
];

export default function Tokenomics() {
  let start = 0;
  const segments = distribution
    .map((d) => {
      const segment = `${d.color} ${start}% ${start + d.percent}%`;
      start += d.percent;
      return segment;
    })
    .join(', ');

  const donutStyle: CSSProperties = {
    ['--donut' as any]: `conic-gradient(${segments})`,
  };

  return (
    <section className="py-16 px-4">
      <h2 className="text-2xl font-bold text-center mb-8">Tokenomics</h2>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-4xl mx-auto flex flex-col items-center gap-8 sm:flex-row"
      >
        <div
          className="donut animate-[spin_20s_linear_infinite]"
          style={donutStyle}
        >
          <div className="hole text-black">
            <div className="text-lg font-bold">1B</div>
            <div className="text-xs uppercase">Supply</div>
          </div>
        </div>
        <ul className="space-y-2 text-sm w-full sm:w-auto">
          {distribution.map((d) => (
            <li key={d.label} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: d.color }}
              />
              <span className="flex-1">{d.label}</span>
              <span className="font-semibold">{d.percent}%</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
