'use client';

import DashboardMarketBoard from '../../../components/dashboard/DashboardMarketBoard';
import { dict, useLang } from '../../lib/i18n';

export default function MarketPage() {
  const { lang } = useLang();
  const t = dict[lang];

  return (
    <div className="space-y-4">
      <header className="x-card space-y-2 p-4">
        <p className="text-xs uppercase tracking-[0.26em] text-white/60">{t.dashboard.market.kicker}</p>
        <h1 className="text-lg font-semibold">{t.dashboard.market.title}</h1>
        <p className="text-sm text-white/60">
          {lang === 'ar'
            ? 'تابع الأسعار المباشرة واضغط على أي زوج عشان تروح مباشرة لتداول الاسبوت.'
            : 'Track live prices and tap any pair to open Spot Trade instantly.'}
        </p>
      </header>

      <section className="x-card p-4">
        <DashboardMarketBoard />
      </section>
    </div>
  );
}
