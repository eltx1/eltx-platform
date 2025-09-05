'use client';

import { formatUnits } from 'ethers';

interface Plan {
  id: number;
  name: string;
  duration_days?: number;
  duration_months?: number;
  apr?: string;
  daily_rate?: string;
  min_deposit_wei: string;
}

export default function PlanCard({ plan }: { plan: Plan }) {
  const duration = plan.duration_days ?? plan.duration_months ?? 0;
  const durationLabel = plan.duration_days ? `${plan.duration_days} days` : plan.duration_months ? `${plan.duration_months} months` : '';
  const rate = plan.apr ?? plan.daily_rate ?? '';
  const minDeposit = formatUnits(BigInt(plan.min_deposit_wei || '0'), 18);
  return (
    <div className="p-4 rounded-2xl bg-white/5 space-y-2">
      <div className="font-semibold">{plan.name}</div>
      {durationLabel && <div className="text-sm opacity-80">Duration: {durationLabel}</div>}
      {rate && <div className="text-sm opacity-80">Rate: {rate}</div>}
      <div className="text-sm opacity-80">Min deposit: {minDeposit} ELTX</div>
      <button className="btn btn-primary w-full mt-2">Stake</button>
    </div>
  );
}

