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
    if (user === null) router.replace('/login');
    if (user) {
      apiFetch('/staking/plans')
        .then((d) => setPlans(d.plans))
        .catch(console.error);
    }
  }, [user, router]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Earn</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <Link
            key={p.id}
            href={`/staking/new?plan=${p.id}`}
            className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition flex flex-col"
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
