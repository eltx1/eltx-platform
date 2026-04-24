'use client';

import Link from 'next/link';
import { CandlestickChart, ShieldCheck, Sparkles } from 'lucide-react';
import { useLang } from '../../app/lib/i18n';

export default function TradingInvestmentShowcase() {
  const { lang } = useLang();
  const isArabic = lang === 'ar';

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <div className="relative overflow-hidden rounded-3xl border border-[#c9a75c]/40 bg-gradient-to-br from-[#0b0f18] via-[#121b2e] to-[#0d121f] p-6 shadow-[0_30px_90px_-40px_rgba(201,167,92,0.55)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#c9a75c]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative grid gap-5 md:grid-cols-[1.4fr,0.9fr] md:items-center">
          <div className="space-y-3.5">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#f4deae]/35 bg-[#c9a75c]/15 px-3 py-1 text-xs font-semibold text-[#f4deae]">
              <Sparkles className="h-3.5 w-3.5" />
              {isArabic ? 'خدمة التداول والاستثمار الذكية' : 'Smart Trading & Investment Service'}
            </p>
            <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
              {isArabic
                ? 'تداول بسرعة، واستثمر بثقة، ونمّي محفظتك من منصة واحدة.'
                : 'Trade faster, invest confidently, and grow your portfolio from one platform.'}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              {isArabic
                ? 'منصة LordAi.Net بتجمع بين تنفيذ صفقات سريع، أدوات تحليل واضحة، وتجربة استثمار آمنة باللغة العربية والإنجليزية.'
                : 'LordAi.Net combines fast execution, clear market tools, and secure investing in both Arabic and English.'}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/trade/spot" className="inline-flex items-center gap-2 rounded-xl bg-[#c9a75c] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
                <CandlestickChart className="h-4 w-4" />
                {isArabic ? 'ابدأ التداول الفوري' : 'Start Spot Trading'}
              </Link>
              <Link href="/wallet" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10">
                <ShieldCheck className="h-4 w-4" />
                {isArabic ? 'إدارة المحفظة' : 'Manage Wallet'}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 text-xs sm:text-sm">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3.5 text-white/85">
              <p className="text-[11px] uppercase tracking-wider text-white/50">{isArabic ? 'تنفيذ' : 'Execution'}</p>
              <p className="mt-1 font-semibold">{isArabic ? 'واجهة سبوت عملية وسريعة' : 'Fast, practical spot interface'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3.5 text-white/85">
              <p className="text-[11px] uppercase tracking-wider text-white/50">{isArabic ? 'ثقة' : 'Trust'}</p>
              <p className="mt-1 font-semibold">{isArabic ? 'متابعة الرصيد والحركات لحظياً' : 'Live balance and activity tracking'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3.5 text-white/85">
              <p className="text-[11px] uppercase tracking-wider text-white/50">{isArabic ? 'نمو' : 'Growth'}</p>
              <p className="mt-1 font-semibold">{isArabic ? 'أدوات تساعدك تبني قرار استثماري أوضح' : 'Tools to support smarter investment decisions'}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
