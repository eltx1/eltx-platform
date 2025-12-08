'use client';

import { ArrowRightLeft, Link2 } from 'lucide-react';
import SectionCta from './SectionCta';

const UNISWAP_URL =
  'https://app.uniswap.org/swap?inputCurrency=ETH&outputCurrency=0x1D8c1B91956E85F7CB1f2753E6226b93e5101A6c&chain=mainnet&theme=dark';

export default function Swap() {
  return (
    <section id="swap-eltx" className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-cyan-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Swap</p>
            <h2 className="text-3xl font-extrabold">Buy ELTX now</h2>
            <p className="text-white/80 text-sm md:text-base max-w-2xl">
              Swap ETH to ELTX directly through Uniswap with the ELTX contract pre-selected as the output token.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
            <ArrowRightLeft className="h-4 w-4" />
            <span>ETH → ELTX</span>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-neutral-900/80 p-4 shadow-2xl shadow-cyan-900/30">
          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-cyan-300" />
                <span>Ready-to-swap Uniswap widget — ELTX contract preloaded for you.</span>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-xl overflow-hidden border border-white/10 bg-black/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/20 bg-white/5 px-3 py-2 text-[13px] text-white/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">ELTX contract</span>
                  <span className="font-mono text-[13px] text-white">0x1D8c1B91956E85F7CB1f2753E6226b93e5101A6c</span>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100 shadow-inner shadow-cyan-900/40">
                  <ArrowRightLeft className="h-4 w-4" />
                  Swap safely inside this page
                </span>
              </div>
              {/* To adjust widget parameters, update the UNISWAP_URL string above. */}
              <iframe
                src={UNISWAP_URL}
                title="Swap ELTX"
                className="w-full h-[720px] md:h-[900px] rounded-lg"
                allow="clipboard-read; clipboard-write; accelerometer; autoplay; gyroscope"
              />
            </div>
          </div>
        </div>
        <SectionCta
          eyebrow="Swap faster"
          title="Create an account to keep swapping"
          copy="Sign up or log in to save your swap preferences, manage balances, and come back to ELTX in one tap."
        />
      </div>
    </section>
  );
}

