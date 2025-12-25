'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatWei } from '../../../lib/format';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';

type WithdrawalRequest = {
  id: number;
  amount_wei: string;
  amount_formatted: string;
  chain: string;
  address: string;
  reason?: string | null;
  status: 'pending' | 'completed' | 'rejected';
  reject_reason?: string | null;
  created_at?: string;
  handled_at?: string | null;
};

type Asset = {
  symbol: string;
  display_symbol: string;
  decimals: number;
  balance_wei: string;
};

export default function WithdrawalPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { lang } = useLang();
  const t = dict[lang];

  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [balance, setBalance] = useState('0');
  const [decimals, setDecimals] = useState(18);
  const [amount, setAmount] = useState('');
  const [chain, setChain] = useState('Ethereum');
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [router, user]);

  const chainOptions = useMemo(
    () => [
      { value: 'Ethereum', label: t.wallet.withdrawalPage.chains.ethereum },
      { value: 'BNB', label: t.wallet.withdrawalPage.chains.bnb },
      { value: 'Solana', label: t.wallet.withdrawalPage.chains.solana },
      { value: 'Base', label: t.wallet.withdrawalPage.chains.base },
    ],
    [t.wallet.withdrawalPage.chains]
  );

  useEffect(() => {
    if (!chainOptions.some((c) => c.value === chain)) {
      setChain(chainOptions[0]?.value || 'Ethereum');
    }
  }, [chain, chainOptions]);

  const statusLabel = useCallback(
    (status: WithdrawalRequest['status']) => t.wallet.withdrawal.statuses[status] || status,
    [t.wallet.withdrawal.statuses]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [assetsRes, requestsRes] = await Promise.all([
      apiFetch<{ assets: Asset[] }>('/wallet/assets'),
      apiFetch<{ requests: WithdrawalRequest[] }>('/wallet/withdrawals'),
    ]);

    if (assetsRes.ok) {
      const eltx = assetsRes.data.assets.find((a) => a.symbol === 'ELTX');
      if (eltx) {
        setBalance(eltx.balance_wei);
        setDecimals(eltx.decimals);
      }
    }
    if (requestsRes.ok) {
      setRequests(requestsRes.data.requests || []);
    } else {
      toast({ message: requestsRes.error || t.common.genericError, variant: 'error' });
    }
    setLoading(false);
  }, [t.common.genericError, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    setSubmitting(true);
    const res = await apiFetch<{ request: WithdrawalRequest }>('/wallet/withdrawals', {
      method: 'POST',
      body: JSON.stringify({ amount, chain, address, reason }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ message: t.wallet.withdrawalPage.success, variant: 'success' });
      setRequests((prev) => [res.data.request, ...prev.filter((r) => r.id !== res.data.request.id)]);
      setAmount('');
      setAddress('');
      setReason('');
      load();
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  const formattedBalance = formatWei(balance, decimals);
  const rules = t.wallet.withdrawalPage.rules;
  const hasPending = requests.some((r) => r.status === 'pending');

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
          {t.wallet.withdrawalPage.badge}
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-tight">{t.wallet.withdrawalPage.title}</h1>
          <p className="text-sm text-white/70">{t.wallet.withdrawalPage.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
          <div className="text-sm opacity-80">{t.wallet.withdrawalPage.balanceLabel}</div>
          <div className="mt-2 text-3xl font-bold">{formattedBalance}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 p-4 shadow-[0_10px_30px_rgba(37,99,235,0.15)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white/90">{t.wallet.withdrawal.title}</p>
              <p className="text-xs text-white/70">{t.wallet.withdrawalPage.lastPurchaseRequired}</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:border-white/40"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t.wallet.withdrawalPage.refresh}
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            {rules.map((rule, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-white/60" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.wallet.withdrawalPage.title}</h2>
          {hasPending && <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-200">{t.wallet.withdrawal.statuses.pending}</span>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-white/80">
            <span>{t.wallet.withdrawalPage.form.amount}</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
              placeholder={t.wallet.withdrawalPage.form.amount}
            />
          </label>
          <label className="space-y-2 text-sm text-white/80">
            <span>{t.wallet.withdrawalPage.form.chain}</span>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
            >
              {chainOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-white/80">
            <span>{t.wallet.withdrawalPage.form.address}</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
              placeholder="0x..."
            />
          </label>
          <label className="space-y-2 text-sm text-white/80 md:col-span-2">
            <span>{t.wallet.withdrawalPage.form.reason}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[96px] w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
              placeholder={t.wallet.withdrawalPage.form.reason}
              maxLength={255}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-white/60">
            <div>
              {t.wallet.withdrawalPage.amountLabel}: {amount || '0'} ELTX
            </div>
            <div>
              {t.wallet.withdrawalPage.balanceLabel}: {formattedBalance} ELTX
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/wallet" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30">
              {t.nav.wallet}
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || !amount || !chain || !address}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t.wallet.withdrawalPage.form.submitting : t.wallet.withdrawalPage.form.submit}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.wallet.withdrawalPage.requestsTitle}</h2>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition hover:border-white/30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t.wallet.withdrawalPage.refresh}
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
            {t.wallet.withdrawalPage.noRequests}
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const status = statusLabel(req.status);
              const created = req.created_at ? new Date(req.created_at).toLocaleString() : '';
              const badgeColor =
                req.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : req.status === 'rejected'
                    ? 'bg-rose-500/15 text-rose-200'
                    : 'bg-amber-500/20 text-amber-200';
              return (
                <div key={req.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      {t.wallet.withdrawalPage.amountLabel}: {req.amount_formatted} ELTX
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeColor}`}>{status}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-white/70 sm:grid-cols-2">
                    <div>
                      <div className="font-semibold text-white/80">{t.wallet.withdrawalPage.destination}</div>
                      <div className="break-all text-white/80">{req.address}</div>
                      <div className="text-white/60">{req.chain}</div>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <span className="font-semibold text-white/80">{t.wallet.withdrawalPage.createdAt}:</span>{' '}
                        <span>{created}</span>
                      </div>
                      {req.reason && (
                        <div>
                          <span className="font-semibold text-white/80">{t.wallet.withdrawalPage.form.reason}:</span>{' '}
                          <span>{req.reason}</span>
                        </div>
                      )}
                      {req.reject_reason && (
                        <div className="text-rose-200">
                          <span className="font-semibold">{t.wallet.withdrawalPage.rejectReason}:</span> {req.reject_reason}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
