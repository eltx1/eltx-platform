'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { apiFetch } from '../../../lib/api';
import { dict, useLang } from '../../../lib/i18n';

export default function PositionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [positions, setPositions] = useState<any[]>([]);
  const { lang } = useLang();
  const t = useMemo(() => dict[lang].staking.positions, [lang]);

  useEffect(() => {
    if (user === null) router.replace('/login');
    if (user) {
      (async () => {
        const res = await apiFetch<{ positions: any[] }>('/staking/positions');
        if (res.ok && res.data.positions) setPositions(res.data.positions);
      })();
    }
  }, [user, router]);

  const today = new Date();
  const formatDate = (value: string) => new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
  const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10);

  const enriched = positions.map((p) => {
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const elapsed = Math.min(
      totalDays,
      Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    );
    const progress = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
    return {
      ...p,
      asset: (p.stake_asset || 'ELTX').toUpperCase(),
      totalDays,
      elapsed,
      progress,
      isMatured: toDateOnly(p.end_date) <= toDateOnly(today.toISOString()),
    };
  });

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <div className="text-xs text-white/60">{t.subtitle}</div>
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">{t.empty}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {enriched.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-white/60">{p.asset}</div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${
                    p.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : 'bg-blue-500/15 text-blue-200'
                  }`}
                >
                  {t.status[(p.status as keyof typeof t.status) || 'active'] || p.status}
                </span>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">{t.amount}</span>
                  <span className="font-semibold">{p.amount} {p.asset}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">{t.daily}</span>
                  <span className="font-semibold text-amber-200">{p.daily_reward} {p.asset}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">{t.accrued}</span>
                  <span className="font-semibold">{p.accrued_total} {p.asset}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>{t.endsOn(formatDate(p.end_date))}</span>
                  <span>{t.progress(p.elapsed, p.totalDays)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">{t.principal}</span>
                  <span className={p.principal_redeemed ? 'text-emerald-200' : 'text-white/80'}>
                    {p.principal_redeemed ? t.principalRedeemed : t.principalPending}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
