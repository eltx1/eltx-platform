'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

export default function StakingPlansPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);

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
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold">Staking Plans</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <Link
            key={p.id}
            href={`/staking/new?plan=${p.id}`}
            className="group relative p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition flex flex-col shadow overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-cyan-500/20 opacity-0 group-hover:opacity-100 transition pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-2">
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs uppercase tracking-wide text-white/60">Asset</div>
              <div className="text-lg font-semibold">{(p.asset || 'ELTX').toUpperCase()}</div>
              <div className="text-xs uppercase tracking-wide text-white/60">Duration</div>
              <div className="text-2xl font-bold mb-2">{p.duration_days} days</div>
              <div className="text-xs uppercase tracking-wide text-white/60">Profit</div>
              <div className="text-xl font-semibold">{(p.apr_bps / 100).toFixed(2)}%</div>
              <div className="text-xs uppercase tracking-wide text-white/60">APR</div>
              {p.min_deposit && (
                <div className="text-xs opacity-70">Min stake: {p.min_deposit} {(p.asset || 'ELTX').toUpperCase()}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
