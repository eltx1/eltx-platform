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
  const [error, setError] = useState('');

  useEffect(() => {
    if (user === null) router.replace('/login');
    if (user) {
      apiFetch('/staking/plans').then((res) => {
        if (res.error) {
          if (res.error.status === 401) router.replace('/login');
          else setError('Failed to load plans');
        } else if (res.data) {
          setPlans(res.data.plans);
          const qs = new URLSearchParams(window.location.search);
          const p = qs.get('plan');
          if (p) setPlanId(Number(p));
        }
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
    setError('');
    const res = await apiFetch('/staking/positions', {
      method: 'POST',
      body: JSON.stringify({ planId, amount }),
    });
    if (res.error) {
      setError('Failed to stake');
    } else if (res.data) {
      router.push('/earn/staking/positions');
    }
  };

  return (
    <div className="p-4 flex justify-center">
      <form
        onSubmit={submit}
        className="space-y-4 w-full max-w-md bg-white/5 border border-white/10 rounded-lg p-6"
      >
        <h1 className="text-xl font-semibold">New Stake</h1>
        {error && <div className="text-sm text-red-500">{error}</div>}
        <select
          value={planId ?? ''}
          onChange={(e) => setPlanId(Number(e.target.value))}
          className="w-full p-2 rounded bg-black/20 border border-white/20 hover:bg-black/30 transition"
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
          className="w-full p-2 rounded bg-black/20 border border-white/20 hover:bg-black/30 transition"
        />
        {daily > 0 && (
          <div className="text-sm">Est. daily reward: {daily.toFixed(8)}</div>
        )}
        <button type="submit" className="btn btn-primary w-full justify-center">
          Stake
        </button>
      </form>
    </div>
  );
}
