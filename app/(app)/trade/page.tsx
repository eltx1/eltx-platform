'use client';

import Link from 'next/link';
import { useLang } from '../../lib/i18n';

const CATEGORIES = [
  { key: 'gold', titleEn: 'GOLD', titleAr: 'الذهب', pairEn: 'XAUT/USDT' },
  { key: 'stocks', titleEn: 'Stocks', titleAr: 'الاسهم', pairEn: 'USDT pairs' },
  { key: 'crypto', titleEn: 'Crypto', titleAr: 'كريبتو', pairEn: 'USDT pairs' },
] as const;

export default function TradePage() {
  const { lang } = useLang();
  const isArabic = lang === 'ar';

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <header className="rounded-3xl border border-white/10 bg-[#0f172a] p-5 text-white">
        <h1 className="text-2xl font-bold">{isArabic ? 'تحويل فوري (Convert)' : 'Instant Convert'}</h1>
        <p className="mt-2 text-sm text-white/75">
          {isArabic
            ? 'اختر القسم اللي عايز تتداول فيه. تم اخفاء زر السبوت مؤقتا من صفحة التداول.'
            : 'Choose your market section. Spot button is temporarily hidden from this trade dashboard.'}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Link
            key={category.key}
            href={`/trade/convert?category=${category.key}`}
            className="group rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white transition hover:border-cyan-300/70 hover:bg-cyan-500/10"
          >
            <div className="text-lg font-semibold">{isArabic ? category.titleAr : category.titleEn}</div>
            <div className="mt-2 text-sm text-white/65">{category.pairEn}</div>
            <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-cyan-200">{isArabic ? 'افتح التحويل' : 'Open convert'}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
