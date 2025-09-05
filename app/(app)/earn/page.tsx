'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import PlanCard from '../../../components/earn/PlanCard';

export default function EarnPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    const load = async () => {
      const res = await apiFetch<any[]>('/staking/plans');
      if (!res.error && res.data) setPlans(res.data);

    };
    load();
  }, []);

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
