export default function SeoIntro() {
  return (
    <section className="bg-neutral-950 border-t border-b border-white/5 py-14 px-4">
      <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/80">Crypto Trading Platform</p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">Trade, swap, and stake ELTX with institutional-grade security.</h2>
          <p className="text-base md:text-lg text-white/80 leading-relaxed">
            ELTX is a bilingual crypto exchange built for fast on-chain execution, secure wallets, and simple onboarding. Buy ELTX with cards, move assets across chains, and manage P2P deals with deep liquidity, all in one streamlined experience.
          </p>
          <p className="text-base md:text-lg text-white/70 leading-relaxed">
            من خلال منصة ELTX تقدر تشتري وتبيع ELTX والعملات الرقمية بسرعة وأمان، مع محافظ ذكية، تداول فوري، وإمكانية التحويل بين الشبكات بالإنجليزي والعربي.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-2xl border border-purple-500/20 bg-white/5 p-4 space-y-2">
              <p className="font-semibold">SEO-ready features</p>
              <ul className="list-disc list-inside text-white/80 space-y-1">
                <li>Spot trading pairs with live pricing and analytics</li>
                <li>P2P marketplace for USDT/USDC deals</li>
                <li>Secure staking with transparent yields</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-cyan-500/20 bg-white/5 p-4 space-y-2">
              <p className="font-semibold">User-focused trust</p>
              <ul className="list-disc list-inside text-white/80 space-y-1">
                <li>24/7 account access with multilingual support</li>
                <li>Advanced security, audits, and monitored sessions</li>
                <li>Clear compliance for global crypto users</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-600/10 via-fuchsia-500/10 to-cyan-500/10 p-6 shadow-lg shadow-purple-900/20 space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Why choose ELTX?</h3>
            <p className="text-white/80 text-sm leading-relaxed">
              Built to remove friction for first-time users and active traders: quick KYC, instant deposits, real-time charts, and responsive support so you can focus on executing your crypto strategy.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-lg">SEO keywords we serve</h4>
            <p className="text-white/75 text-sm leading-relaxed">
              Crypto trading platform, ELTX exchange, buy ELTX token, Web3 wallet, DeFi gateway, staking, P2P crypto marketplace, منصة تداول كريبتو، شراء وبيع العملات الرقمية.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-lg">Transparent value</h4>
            <ul className="list-disc list-inside text-white/80 space-y-1 text-sm">
              <li>Cross-chain support for BSC and Ethereum</li>
              <li>Instant swaps with optimized slippage controls</li>
              <li>In-app AI assistant for market answers</li>
              <li>Guided Arabic/English flows from signup to trading</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
