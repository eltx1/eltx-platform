'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

export default function NewStakePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [daily, setDaily] = useState(0);

  useEffect(() => {
    if (user === null) router.replace('/login');
    if (user) {
      apiFetch('/staking/plans').then((d) => {
        setPlans(d.plans);
        const qs = new URLSearchParams(window.location.search);
        const p = qs.get('plan');
        if (p) setPlanId(Number(p));
      });
    }
  }, [user, router]);

  useEffect(() => {
    const plan = plans.find((p) => p.id === planId);
    const amt = parseFloat(amount);
    if (plan && amt > 0) {
      setDaily(amt * (plan.apr_bps / 10000 / 365));
    } else {
      setDaily(0);
    }
  }, [planId, amount, plans]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/staking/positions', {
        method: 'POST',
        body: JSON.stringify({ planId, amount }),
      });
      router.push('/staking/positions');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">New Stake</h1>
      <form onSubmit={submit} className="space-y-4 max-w-sm">
        <select
          value={planId ?? ''}
          onChange={(e) => setPlanId(Number(e.target.value))}
          className="w-full p-2 rounded bg-white/5"
        >
          <option value="" disabled>
            Select plan
          </option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-full p-2 rounded bg-white/5"
        />
        {daily > 0 && (
          <div className="text-sm">Est. daily reward: {daily.toFixed(8)}</div>
        )}
        <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">
          Stake
        </button>
      </form>
    </div>
  );
}
