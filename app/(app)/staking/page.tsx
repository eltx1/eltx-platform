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
      const res = await apiFetch('/staking/plans');
      if (res.data) setPlans(res.data.plans);
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
            className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition flex flex-col shadow"
          >
            <div className="font-semibold mb-1">{p.name}</div>
            <div className="text-sm mb-1">{p.duration_days} days</div>
            <div className="text-sm">{(p.apr_bps / 100).toFixed(2)}% APR</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
