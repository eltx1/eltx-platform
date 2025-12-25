'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
type Transaction = {
  tx_hash: string | null;
  amount_wei: string;
  display_symbol: string;
  decimals: number;
  amount_formatted: string;
  amount_int: string;
  confirmations: number;
  status: string;
  created_at: string;
  type: 'deposit' | 'transfer';
  direction?: 'in' | 'out';
  counterparty?: number;
  chain_id?: number;
};
type Pagination = { page: number; page_size: number; total: number; total_pages?: number; has_more?: boolean };
type TransactionsResponse = { transactions: Transaction[]; pagination?: Pagination };

export default function TransactionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    page_size: pageSize,
    total: 0,
    total_pages: 1,
    has_more: false,
  });

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    const load = (pageOverride = page, filterOverride = filter) => {
      apiFetch<TransactionsResponse>(
        `/wallet/transactions?page=${pageOverride}&limit=${pageSize}&status=${filterOverride}`
      ).then((res) => {
        if (!res.ok) {
          if (res.status === 401) router.replace('/login');
        } else {
          setTransactions(res.data.transactions || []);
          const paginationInfo = res.data.pagination;
          const total = paginationInfo?.total ?? res.data.transactions?.length ?? 0;
          const size = paginationInfo?.page_size ?? pageSize;
          const current = paginationInfo?.page ?? pageOverride;
          const totalPages = paginationInfo?.total_pages ?? Math.max(1, Math.ceil(total / (size || 1)));
          setPagination({
            page: current,
            page_size: size,
            total,
            total_pages: totalPages,
            has_more: paginationInfo?.has_more ?? current < totalPages,
          });
          setPage(current);
        }
      });
    };
    load();
    const id = setInterval(() => load(), 10000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [filter, page, pageSize, router, user]);

  const statusLabel = (s: string) => {
    if (s === 'seen') return t.wallet.table.status.pending;
    if (s === 'confirmed' || s === 'swept') return t.wallet.table.status.confirmed;
    if (s === 'orphaned') return t.wallet.table.status.orphaned;
    if (s === 'sent') return t.wallet.transfer.sent;
    if (s === 'received') return t.wallet.transfer.received;
    return s;
  };

  const changePage = (next: number) => {
    const totalPages = pagination.total_pages || 1;
    const target = Math.min(Math.max(next, 1), totalPages);
    if (target === page) return;
    setPage(target);
  };

  const handleFilterChange = (value: 'all' | 'pending' | 'confirmed') => {
    setFilter(value);
    setPage(1);
  };

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.transactions.title}</h1>
      <select
        value={filter}
        onChange={e => handleFilterChange(e.target.value as any)}
        className="bg-black/20 border border-white/20 p-2 rounded"
      >
        <option value="all">{t.transactions.filter.all}</option>
        <option value="pending">{t.transactions.filter.pending}</option>
        <option value="confirmed">{t.transactions.filter.confirmed}</option>
      </select>
      <div className="space-y-2">
        {transactions.map(d => (
          <div key={(d.tx_hash || '') + d.created_at} className="p-3 bg-white/5 rounded text-sm space-y-1">
            <div className="flex justify-between text-xs opacity-70">
              <span>{new Date(d.created_at).toLocaleString()}</span>
              <span>{d.confirmations}</span>
            </div>
            {d.tx_hash ? (
              <a
                href={`${d.chain_id === 1 ? 'https://etherscan.io/tx/' : 'https://bscscan.com/tx/'}${d.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline"
              >
                {d.tx_hash}
              </a>
            ) : (
              <div>
                {d.direction === 'out'
                  ? `${t.wallet.transfer.to} ${d.counterparty}`
                  : `${t.wallet.transfer.from} ${d.counterparty}`}
              </div>
            )}
            <div>
              {(d.direction === 'out' ? '-' : '') + Number(d.amount_formatted).toFixed(6)} {d.display_symbol}
            </div>
            <div className="text-xs">{statusLabel(d.status)}</div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-sm">-</div>}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-white/60">
          {t.common.pagination.page} {pagination.page} {t.common.pagination.of} {pagination.total_pages || 1} •{' '}
          {pagination.total} {t.common.pagination.total}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => changePage(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="rounded-full border border-white/20 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:border-white/40 transition"
          >
            {t.common.pagination.previous}
          </button>
          <button
            onClick={() => changePage(pagination.page + 1)}
            disabled={pagination.page >= (pagination.total_pages || 1)}
            className="rounded-full border border-white/20 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:border-white/40 transition"
          >
            {t.common.pagination.next}
          </button>
        </div>
      </div>
    </div>
  );
}
