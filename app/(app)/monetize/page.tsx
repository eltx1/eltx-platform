'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../lib/i18n';
import { getAllPosts } from '../../lib/social-store';
import { apiFetch } from '../../lib/api';
import {
  getCreatorUniqueViews,
  getMonetizationSettings,
  getPayouts,
  getPremiumFollowersCount,
  maybeScheduleMonthlyPayout,
  setMonetizationSettings,
  type MonetizationSettings,
} from '../../lib/monetization';

export default function MonetizePage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const [settings, setSettings] = useState<MonetizationSettings>(getMonetizationSettings());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const res = await apiFetch<{ settings: MonetizationSettings }>('/api/admin/monetization-settings');
      if (res.ok && res.data?.settings) {
        setMonetizationSettings(res.data.settings);
        setSettings(res.data.settings);
      }
    };
    load();
  }, []);

  const [posts, setPosts] = useState(() => getAllPosts(user?.id));
  const premiumFollowers = getPremiumFollowersCount(user?.id);
  const isPremium = Boolean(user?.is_premium);
  const hasFollowersRequirement = premiumFollowers >= settings.requiredPremiumFollowers;
  const eligible = isPremium && hasFollowersRequirement;
  const myHandle = useMemo(() => {
    if (user?.username) return `@${String(user.username).replace(/^@/, '')}`;
    return null;
  }, [user?.username]);
  const totalViews = useMemo(() => getCreatorUniqueViews(posts, myHandle), [posts, myHandle]);
  const unpaidAmount = useMemo(() => Number(((totalViews / 1000) * settings.payoutPerThousandViews).toFixed(6)), [totalViews, settings.payoutPerThousandViews]);

  useEffect(() => {
    setPosts(getAllPosts(user?.id));
    setPayouts(getPayouts(user?.id));
  }, [refreshKey, user?.id]);
  const [payouts, setPayouts] = useState(() => getPayouts(user?.id));

  useEffect(() => {
    maybeScheduleMonthlyPayout({ userId: user?.id, eligible, totalViews, payoutPerThousandViews: settings.payoutPerThousandViews });
    setRefreshKey((v) => v + 1);
  }, [eligible, settings.payoutPerThousandViews, totalViews, user?.id]);

  return (
    <main className="space-y-4">
      <section className="x-card p-4">
        <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{lang === 'ar' ? 'تحقيق الربح' : 'Monetization'}</p>
        <h1 className="mt-1 text-lg font-semibold">{lang === 'ar' ? 'لوحة منشئي المحتوى' : 'Creator Monetization'}</h1>
        <p className="mt-1 text-xs text-white/65">{lang === 'ar' ? 'تابع حالة الأهلية والأرباح المجدولة للدفع.' : 'Track eligibility and your scheduled payouts.'}</p>
      </section>

      {!eligible && (
        <section className="x-card space-y-3 p-4">
          <h2 className="text-sm font-semibold">{lang === 'ar' ? 'غير مؤهل حاليًا' : 'Not eligible yet'}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span>{lang === 'ar' ? 'عضوية بريميم مفعلة' : 'Active premium membership'}</span>
              <span>{isPremium ? '✅' : '⬜'}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span>{lang === 'ar' ? `متابعين بريميم: ${premiumFollowers}/${settings.requiredPremiumFollowers}` : `Premium followers: ${premiumFollowers}/${settings.requiredPremiumFollowers}`}</span>
              <span>{hasFollowersRequirement ? '✅' : '⬜'}</span>
            </div>
          </div>
          {!isPremium && <Link href="/premium" className="btn btn-primary px-3 py-2 text-xs w-fit">{lang === 'ar' ? 'اشترك في بريميم' : 'Upgrade to Premium'}</Link>}
        </section>
      )}

      {eligible && (
        <section className="x-card space-y-4 p-4">
          <h2 className="text-sm font-semibold">{lang === 'ar' ? 'لوحة الأرباح' : 'Earnings Dashboard'}</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs text-white/60">{lang === 'ar' ? 'إجمالي Unique Views' : 'Total unique views'}</p>
              <p className="mt-1 text-lg font-semibold">{totalViews.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs text-white/60">{lang === 'ar' ? 'الأرباح غير المدفوعة (USDT)' : 'Estimated unpaid (USDT)'}</p>
              <p className="mt-1 text-lg font-semibold">{unpaidAmount.toFixed(6)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs text-white/60">{lang === 'ar' ? 'ربح كل 1000 View (USDT)' : 'Per 1000 views (USDT)'}</p>
              <p className="mt-1 text-lg font-semibold">{settings.payoutPerThousandViews}</p>
            </div>
          </div>
        </section>
      )}

      <section className="x-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">{lang === 'ar' ? 'الأرباح المجدولة للدفع' : 'Scheduled payouts'}</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-white/65">{lang === 'ar' ? 'لا توجد دفعات مجدولة حالياً.' : 'No scheduled payouts yet.'}</p>
        ) : (
          <div className="space-y-2">
            {payouts.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{item.monthKey}</span>
                  <span>{item.amountUsdt.toFixed(6)} USDT</span>
                </div>
                <p className="text-xs text-white/60 mt-1">{lang === 'ar' ? `Views: ${item.views} • الحالة: ${item.status}` : `Views: ${item.views} • Status: ${item.status}`}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
