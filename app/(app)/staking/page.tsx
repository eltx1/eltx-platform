'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';

export default function StakingPlansPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const { lang } = useLang();
  const t = useMemo(() => dict[lang].staking.plans, [lang]);

  useEffect(() => {
    if (user === null) {
      router.replace('/login');
      return;
    }

    const fetchPlans = async () => {
      const res = await apiFetch<{ plans: any[] }>('/staking/plans');
      if (res.ok) setPlans(res.data.plans);
    };

    if (user) fetchPlans();
  }, [user, router]);

  return (
    <div className="p-4 space-y-8 max-w-5xl mx-auto">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-purple-500/5 to-cyan-500/5 p-8 shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">{t.kicker}</p>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="text-sm text-white/70 max-w-2xl">{t.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-black/30 border border-white/10 p-3 text-center">
              <div className="text-xs text-white/60">{t.payoutTitle}</div>
              <div className="text-lg font-semibold">{t.payoutValue}</div>
            </div>
            <div className="rounded-2xl bg-black/30 border border-white/10 p-3 text-center">
              <div className="text-xs text-white/60">{t.principalTitle}</div>
              <div className="text-lg font-semibold">{t.principalValue}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.listTitle}</h2>
          <span className="text-xs text-white/60">{t.aprNotice}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const asset = (p.asset || 'ELTX').toUpperCase();
            const apr = (p.apr_bps / 100).toFixed(2);
            const dailyPct = (p.apr_bps / 100 / 365).toFixed(2);
            return (
              <Link
                key={p.id}
                href={`/staking/new?plan=${p.id}`}
                className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md transition hover:-translate-y-1 hover:border-white/30 hover:shadow-xl"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 opacity-0 transition group-hover:opacity-100" />
                <div className="relative z-10 flex items-center justify-between">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">{apr}% APR</span>
                </div>
                <div className="relative z-10 space-y-1 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <span>{t.asset}</span>
                    <span className="font-semibold text-white">{asset}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t.duration}</span>
                    <span className="font-semibold text-white">{t.durationValue(p.duration_days)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t.dailyReturn}</span>
                    <span className="font-semibold text-amber-200">{t.dailyReturnValue(dailyPct)}</span>
                  </div>
                  {p.min_deposit && (
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>{t.minDeposit}</span>
                      <span className="font-semibold text-white/80">{p.min_deposit} {asset}</span>
                    </div>
                  )}
                </div>
                <div className="relative z-10 flex items-center justify-between text-xs text-blue-200/80">
                  <span>{t.cta}</span>
                  <span className="transition group-hover:translate-x-1">↗</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
