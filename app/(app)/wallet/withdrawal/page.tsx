'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseUnits } from 'ethers';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatWei } from '../../../lib/format';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';

type WithdrawalRequest = {
  id: number;
  asset: string;
  asset_decimals?: number;
  amount_wei: string;
  amount_formatted: string;
  fee_bps?: number;
  fee_wei?: string;
  fee_formatted?: string;
  net_amount_wei?: string;
  net_amount_formatted?: string;
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

type WithdrawalLimit = { min: string; min_wei: string };
type WithdrawalLimits = Record<string, WithdrawalLimit>;

const WITHDRAWABLE_ASSETS = ['ELTX', 'USDT'] as const;
const WITHDRAWAL_DEFAULT_DECIMALS: Record<string, number> = { ELTX: 18, USDT: 6 };

export default function WithdrawalPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { lang } = useLang();
  const t = dict[lang];

  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const assetsRef = useRef<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<(typeof WITHDRAWABLE_ASSETS)[number]>('ELTX');
  const selectedAssetRef = useRef<(typeof WITHDRAWABLE_ASSETS)[number]>('ELTX');
  const [balance, setBalance] = useState('0');
  const [decimals, setDecimals] = useState(18);
  const [withdrawalFeeBps, setWithdrawalFeeBps] = useState(0);
  const [limits, setLimits] = useState<WithdrawalLimits>({});
  const [amount, setAmount] = useState('');
  const [chain, setChain] = useState('Ethereum');
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [router, user]);

  useEffect(() => {
    selectedAssetRef.current = selectedAsset;
  }, [selectedAsset]);

  const applyAssetSelection = useCallback((symbol: (typeof WITHDRAWABLE_ASSETS)[number], list?: Asset[]) => {
    const source = list ?? assetsRef.current;
    const target = source.find((a) => a.symbol === symbol);
    const fallbackDecimals = WITHDRAWAL_DEFAULT_DECIMALS[symbol] ?? 18;
    setSelectedAsset(symbol);
    setBalance(target?.balance_wei ?? '0');
    setDecimals(target?.decimals ?? fallbackDecimals);
  }, []);

  const formatPercentFromBps = useCallback((bps?: number | null) => {
    if (bps === undefined || bps === null) return '';
    const pct = (bps / 100).toFixed(2);
    return `${pct.replace(/\.?0+$/, '')}%`;
  }, []);

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
      apiFetch<{ requests: WithdrawalRequest[]; fee_bps?: number; limits?: WithdrawalLimits }>('/wallet/withdrawals'),
    ]);

    if (assetsRes.ok) {
      const normalizedAssets: Asset[] = WITHDRAWABLE_ASSETS.map((sym) => {
        const found = assetsRes.data.assets.find((a) => a.symbol === sym);
        if (found) return found;
        return {
          symbol: sym,
          display_symbol: sym,
          decimals: WITHDRAWAL_DEFAULT_DECIMALS[sym] ?? 18,
          balance_wei: '0',
        };
      });
      setAssets(normalizedAssets);
      assetsRef.current = normalizedAssets;
      const fallbackSymbol =
        (normalizedAssets[0]?.symbol as (typeof WITHDRAWABLE_ASSETS)[number] | undefined) || WITHDRAWABLE_ASSETS[0];
      const preferred = normalizedAssets.find((a) => a.symbol === selectedAssetRef.current)
        ? selectedAssetRef.current
        : fallbackSymbol;
      applyAssetSelection(preferred, normalizedAssets);
    }
    if (requestsRes.ok) {
      setRequests(requestsRes.data.requests || []);
      if (typeof requestsRes.data.fee_bps === 'number') setWithdrawalFeeBps(requestsRes.data.fee_bps);
      if (requestsRes.data.limits) setLimits(requestsRes.data.limits);
    } else {
      toast({ message: requestsRes.error || t.common.genericError, variant: 'error' });
    }
    setLoading(false);
  }, [applyAssetSelection, t.common.genericError, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const availableAssets = useMemo(() => {
    if (assets.length) return assets;
    return WITHDRAWABLE_ASSETS.map((sym) => ({
      symbol: sym,
      display_symbol: sym,
      decimals: WITHDRAWAL_DEFAULT_DECIMALS[sym] ?? 18,
      balance_wei: '0',
    }));
  }, [assets]);

  const handleSubmit = async () => {
    if (!amountIsPositive || !amountWei) {
      toast({ message: t.wallet.withdrawalPage.form.invalidAmount, variant: 'error' });
      return;
    }
    if (exceedsBalance) {
      toast({ message: t.wallet.withdrawalPage.form.exceedsBalance, variant: 'error' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch<{ request: WithdrawalRequest }>('/wallet/withdrawals', {
      method: 'POST',
      body: JSON.stringify({ amount, asset: selectedAsset, chain, address, reason }),
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

  const rules = t.wallet.withdrawalPage.rules;
  const hasPending = requests.some((r) => r.status === 'pending');
  const balanceWei = useMemo(() => {
    try {
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }, [balance]);
  const amountWei = useMemo(() => {
    if (!amount) return null;
    try {
      return parseUnits(amount, decimals);
    } catch {
      return null;
    }
  }, [amount, decimals]);
  const feeWei = useMemo(() => {
    if (amountWei === null) return null;
    try {
      return (amountWei * BigInt(withdrawalFeeBps)) / 10000n;
    } catch {
      return null;
    }
  }, [amountWei, withdrawalFeeBps]);
  const netAmountWei = useMemo(() => {
    if (amountWei === null || feeWei === null) return null;
    return amountWei - feeWei;
  }, [amountWei, feeWei]);
  const selectedLimit = limits[selectedAsset];
  const minWei = useMemo(() => {
    if (!selectedLimit?.min_wei) return 0n;
    try {
      return BigInt(selectedLimit.min_wei);
    } catch {
      return 0n;
    }
  }, [selectedLimit]);
  const exceedsBalance = amountWei !== null && amountWei > balanceWei;
  const netIsPositive = netAmountWei !== null && netAmountWei > 0n;
  const belowMinimum = amountWei !== null && minWei > 0n && amountWei < minWei;
  const amountIsPositive = amountWei !== null && amountWei > 0n && netIsPositive && !belowMinimum;
  const formattedBalance = formatWei(balance, decimals);
  const feeFormatted = feeWei !== null && feeWei >= 0n ? formatWei(feeWei.toString(), decimals) : '0';
  const netFormatted = netAmountWei !== null && netAmountWei > 0n ? formatWei(netAmountWei.toString(), decimals) : '0';
  const feePercentLabel = formatPercentFromBps(withdrawalFeeBps) || '0%';
  const canSubmit = !submitting && !!chain && !!address && amountIsPositive && !exceedsBalance;

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
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {availableAssets.map((asset) => {
              const isSelected = asset.symbol === selectedAsset;
              const displayBalance = formatWei(asset.balance_wei, asset.decimals);
              return (
                <button
                  type="button"
                  key={asset.symbol}
                  onClick={() => applyAssetSelection(asset.symbol as (typeof WITHDRAWABLE_ASSETS)[number])}
                  className={`rounded-2xl border p-4 text-left shadow-inner transition ${
                    isSelected
                      ? 'border-cyan-400/60 bg-white/10 shadow-cyan-500/10'
                      : 'border-white/10 bg-black/20 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-white/70">
                    <span>{t.wallet.withdrawalPage.balanceLabel}</span>
                    {isSelected && (
                      <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                        {t.wallet.withdrawalPage.selectedAsset}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">
                    {displayBalance} <span className="text-lg text-white/80">{asset.symbol}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70 shadow-inner shadow-black/10">
            <div className="flex items-center justify-between text-white/80">
              <span className="text-sm font-semibold">{t.wallet.withdrawalPage.feeLabel}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">{feePercentLabel}</span>
            </div>
            <p className="mt-1">{t.wallet.withdrawalPage.feeNotice.replace('{fee}', feePercentLabel)}</p>
          </div>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-2 text-sm text-white/80">
            <span>
              {t.wallet.withdrawalPage.form.amount} ({selectedAsset})
            </span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
              placeholder={t.wallet.withdrawalPage.form.amount}
            />
            {exceedsBalance && (
              <p className="text-xs font-semibold text-amber-200">{t.wallet.withdrawalPage.form.exceedsBalance}</p>
            )}
            {!netIsPositive && amount && (
              <p className="text-xs font-semibold text-amber-200">{t.wallet.withdrawalPage.form.invalidAmount}</p>
            )}
            {selectedLimit?.min && selectedLimit.min !== '0' && (
              <p className="text-xs text-white/60">
                {t.wallet.withdrawalPage.form.minAmount.replace('{amount}', `${selectedLimit.min} ${selectedAsset}`)}
              </p>
            )}
            {belowMinimum && (
              <p className="text-xs font-semibold text-amber-200">
                {t.wallet.withdrawalPage.form.belowMinimum.replace('{amount}', `${selectedLimit?.min || '0'} ${selectedAsset}`)}
              </p>
            )}
          </label>
          <label className="space-y-2 text-sm text-white/80">
            <span>{t.wallet.withdrawalPage.form.asset}</span>
            <select
              value={selectedAsset}
              onChange={(e) => applyAssetSelection(e.target.value as (typeof WITHDRAWABLE_ASSETS)[number])}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
            >
              {availableAssets.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  {asset.symbol}
                </option>
              ))}
            </select>
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
          <label className="space-y-2 text-sm text-white/80 md:col-span-2 lg:col-span-3">
            <span>{t.wallet.withdrawalPage.form.address}</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-cyan-300 focus:outline-none"
              placeholder="0x..."
            />
          </label>
          <label className="space-y-2 text-sm text-white/80 md:col-span-2 lg:col-span-3">
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
              {t.wallet.withdrawalPage.amountLabel}: {amount || '0'} {selectedAsset}
            </div>
            <div>
              {t.wallet.withdrawalPage.balanceLabel}: {formattedBalance} {selectedAsset}
            </div>
            {selectedLimit?.min && selectedLimit.min !== '0' && (
              <div>
                {t.wallet.withdrawalPage.minimumLabel}: {selectedLimit.min} {selectedAsset}
              </div>
            )}
            <div>
              {t.wallet.withdrawalPage.feeLabel}: {feeFormatted} {selectedAsset} ({feePercentLabel})
            </div>
            <div>
              {t.wallet.withdrawalPage.netLabel}: {netFormatted} {selectedAsset}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/wallet" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30">
              {t.nav.wallet}
            </Link>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
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
              const assetSymbol = req.asset || 'ELTX';
              const amountDisplay = req.net_amount_formatted || req.amount_formatted;
              const feeText = req.fee_formatted && req.fee_formatted !== '0' ? `${req.fee_formatted} ${assetSymbol}` : null;
              const feePercent = formatPercentFromBps(req.fee_bps);
              const badgeColor =
                req.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : req.status === 'rejected'
                    ? 'bg-rose-500/15 text-rose-200'
                    : 'bg-amber-500/20 text-amber-200';
              return (
                <div key={req.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1 text-sm font-semibold">
                      <div>
                        {t.wallet.withdrawalPage.amountLabel}: {amountDisplay} {assetSymbol}
                      </div>
                      <div className="text-xs font-normal text-white/60">
                        {t.wallet.withdrawalPage.requestedLabel}: {req.amount_formatted} {assetSymbol}
                        {feeText ? ` • ${t.wallet.withdrawalPage.feeLabel}: ${feeText}${feePercent ? ` (${feePercent})` : ''}` : ''}
                      </div>
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
