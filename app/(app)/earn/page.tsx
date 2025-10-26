'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import PlanCard from '../../../components/earn/PlanCard';

type Plan = {
  id: number | string;
  name?: string;
  title?: string;
  duration_days?: number;
  apr?: string;
  daily_rate?: string;
  min_deposit_wei: string;
};

export default function EarnPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const load = useCallback(async () => {
    const res = await apiFetch<Plan[]>('/staking/plans');
    if (res.ok && Array.isArray(res.data)) {
      setPlans(res.data);
    } else {
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="p-4 space-y-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold">Earn</h1>
      <div className="grid gap-4">
        {plans.length === 0 && <div>No plans available</div>}
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </div>
  );
}
