'use client';

import { Copy, ExternalLink, Network } from 'lucide-react';
import { useState } from 'react';

const CONTRACT_ADDRESS = '0x1D8c1B91956E85F7CB1f2753E6226b93e5101A6c';

export default function EthereumToken() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Copy failed', error);
    }
  };

  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-900">
      <div className="max-w-5xl mx-auto rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-purple-900/10 backdrop-blur-md p-6 md:p-10">
        <div className="flex items-start gap-4 md:items-center md:justify-between flex-col md:flex-row">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-fuchsia-300/80 uppercase text-xs tracking-[0.3em]">
              <Network className="h-4 w-4" />
              <span>ELTX on Ethereum</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold">ELTX Token على شبكة Ethereum</h2>
            <p className="text-white/80 text-sm md:text-base leading-relaxed">
              عنوان عقد ELTX على شبكة Ethereum:
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex-1 rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-3 font-mono text-sm break-all">
                {CONTRACT_ADDRESS}
              </div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-gradient-to-r from-purple-700 to-cyan-600 px-4 py-3 text-sm font-semibold shadow-lg shadow-purple-900/20"
              >
                <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <a
              href="https://etherscan.io/token/0x1D8c1B91956E85F7CB1f2753E6226b93e5101A6c"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-white underline-offset-4"
            >
              <ExternalLink className="h-4 w-4" /> عرض على Etherscan
            </a>
          </div>
          <div className="w-full md:w-auto">
            <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-600/30 via-fuchsia-500/20 to-cyan-500/30 p-6 text-sm text-white/80 shadow-inner shadow-purple-900/40 space-y-2 max-w-sm">
              <p className="font-semibold text-white">Ready for wallets & explorers</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Use the contract above for wallet imports.</li>
                <li>Placeholder link ready for owner adjustments if needed.</li>
                <li>Secure reference for integrations and swaps.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

