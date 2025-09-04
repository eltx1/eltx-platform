'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { apiFetch } from '../../../lib/api';

export default function PositionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [positions, setPositions] = useState<any[]>([]);

  useEffect(() => {
    if (user === null) router.replace('/login');
    if (user) {
      apiFetch('/staking/positions').then((d) => setPositions(d.positions));
    }
  }, [user, router]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">My Stakes</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white/10">
            <tr>
              <th className="p-2 text-left">Plan</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-right">Accrued</th>
              <th className="p-2 text-left">End</th>
              <th className="p-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-2">{p.name}</td>
                <td className="p-2 text-right">{p.amount}</td>
                <td className="p-2 text-right">{p.accrued_total}</td>
                <td className="p-2">{p.end_date?.slice(0, 10)}</td>
                <td className="p-2">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
