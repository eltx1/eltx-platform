'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
type Deposit = {
  tx_hash: string;
  amount_wei: string;
  symbol: string;
  decimals: number;
  amount_formatted: string;
  confirmations: number;
  status: string;
  created_at: string;
};

export default function TransactionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('all');

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    const load = () => {
      apiFetch<{ transactions: Deposit[] }>('/wallet/transactions').then(res => {
        if (!res.ok) {
          if (res.status === 401) router.replace('/login');
        } else {
          setDeposits(res.data.transactions || []);
        }
      });
    };
    load();
    const id = setInterval(load, 10000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [router]);

  const statusLabel = (s: string) => {
    if (s === 'seen') return t.wallet.table.status.pending;
    if (s === 'confirmed' || s === 'swept') return t.wallet.table.status.confirmed;
    if (s === 'orphaned') return t.wallet.table.status.orphaned;
    return s;
  };

  const filtered = deposits.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'pending') return d.status === 'seen';
    return d.status === 'confirmed' || d.status === 'swept';
  });

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.transactions.title}</h1>
      <select
        value={filter}
        onChange={e => setFilter(e.target.value as any)}
        className="bg-black/20 border border-white/20 p-2 rounded"
      >
        <option value="all">{t.transactions.filter.all}</option>
        <option value="pending">{t.transactions.filter.pending}</option>
        <option value="confirmed">{t.transactions.filter.confirmed}</option>
      </select>
      <div className="space-y-2">
        {filtered.map(d => (
          <div key={d.tx_hash} className="p-3 bg-white/5 rounded text-sm space-y-1">
            <div className="flex justify-between text-xs opacity-70">
              <span>{new Date(d.created_at).toLocaleString()}</span>
              <span>{d.confirmations}</span>
            </div>
            <a
              href={`https://bscscan.com/tx/${d.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline"
            >
              {d.tx_hash}
            </a>
            <div>
              {Number(d.amount_formatted).toFixed(6)} {d.symbol}
            </div>
            <div className="text-xs">{statusLabel(d.status)}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-sm">-</div>}
      </div>
    </div>
  );
}
