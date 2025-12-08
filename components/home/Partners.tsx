'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import SectionCta from './SectionCta';

const partners = [
  {
    name: 'BNB Chain',
    description: 'Scaling EVM performance for millions of daily users.',
    logo: '/partners/bnb-chain.svg',
  },
  {
    name: 'Ethereum',
    description: 'The settlement layer we rely on for trust and security.',
    logo: '/partners/ethereum.svg',
  },
  {
    name: 'Polygon',
    description: 'Low-fee rollups that keep payments fast and predictable.',
    logo: '/partners/polygon.svg',
  },
  {
    name: 'Avalanche',
    description: 'High-throughput rails for asset issuance and liquidity.',
    logo: '/partners/avalanche.svg',
  },
  {
    name: 'Arbitrum',
    description: 'Proven Layer 2 network for enterprise-grade settlements.',
    logo: '/partners/arbitrum.svg',
  },
  {
    name: 'Solana',
    description: 'Ultra-fast confirmations powering real-time experiences.',
    logo: '/partners/solana.svg',
  },
];

export default function Partners() {
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-fuchsia-950/10 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">Partners</p>
          <h2 className="text-3xl font-bold">Building with trusted networks</h2>
          <p className="text-white/70 text-sm md:text-base max-w-3xl mx-auto">
            Our ecosystem is live across leading chains and tooling providers, giving teams reliable rails for transfers, swaps, and on-chain services.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((partner, index) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600/60 via-fuchsia-500/60 to-cyan-500/60"
              whileHover={{ y: -6 }}
            >
              <div className="h-full rounded-2xl bg-black/70 p-6 flex flex-col gap-4 border border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                      <Image src={partner.logo} alt={`${partner.name} logo`} width={32} height={32} className="h-8 w-8 object-contain" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg leading-tight">{partner.name}</h3>
                      <p className="text-xs uppercase tracking-[0.2em] text-white/60">Network partner</p>
                    </div>
                  </div>
                  <span className="text-sm text-white/70">Live</span>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{partner.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <SectionCta
          eyebrow="Grow with us"
          title="Start building on ELTX"
          copy="Sign up to join our partner ecosystem or log in to keep collaborating with the networks already live."
        />
      </div>
    </section>
  );
}
