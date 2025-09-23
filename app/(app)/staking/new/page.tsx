'use client';

import Decimal from 'decimal.js';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

type Plan = {
  id: number;
  name: string;
  duration_days: number;
  apr_bps: number;
  asset: string;
  asset_decimals: number;
  min_deposit?: string | null;
};

type WalletAsset = {
  symbol: string;
  balance: string;
  balance_wei: string;
  decimals: number;
};

function formatDecimal(value: Decimal | string | number | null | undefined, places = 6) {
  if (value === null || value === undefined) return '0';
  try {
    const decimal = value instanceof Decimal ? value : new Decimal(value);
    const fixed = decimal.toFixed(places, Decimal.ROUND_DOWN);
    const trimmed = fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    return trimmed.endsWith('.') ? trimmed.slice(0, -1) || '0' : trimmed || '0';
  } catch {
    return '0';
  }
}

function safeDecimal(value: string | number | null | undefined) {
  try {
    if (value === null || value === undefined) return new Decimal(0);
    const normalized = typeof value === 'string' && value.trim() === '' ? '0' : value;
    return new Decimal(normalized as Decimal.Value);
  } catch {
    return new Decimal(0);
  }
}

export default function NewStakePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [planId, setPlanId] = useState<number | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const qsPlan = () => {
      const qs = new URLSearchParams(window.location.search);
      const p = qs.get('plan');
      return p ? Number(p) : undefined;
    };
    (async () => {
      setLoading(true);
      const res = await apiFetch<{ plans: Plan[] }>('/staking/plans');
      if (!cancelled) {
        setLoading(false);
        if (res.ok) {
          setPlans(res.data.plans);
          const preferred = qsPlan();
          if (preferred) setPlanId(preferred);
        } else if (res.status === 401) {
          router.replace('/login');
        } else {
          setError(res.error || 'حصل خطأ أثناء تحميل خطط الاستاكينج.');
        }
      }
    })();
    (async () => {
      const res = await apiFetch<{ assets: WalletAsset[] }>('/wallet/assets');
      if (!cancelled && res.ok) setAssets(res.data.assets);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  useEffect(() => {
    if (planId !== undefined) return;
    if (plans.length === 0) return;
    setPlanId(plans[0].id);
  }, [plans, planId]);

  useEffect(() => {
    if (!plans.length) return;
    if (planId === undefined) return;
    if (!plans.some((p) => p.id === planId)) setPlanId(plans[0].id);
  }, [plans, planId]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) || null, [plans, planId]);

  const assetSymbol = selectedPlan?.asset?.toUpperCase() || 'ELTX';
  const walletAsset = useMemo(
    () => assets.find((a) => (a.symbol || '').toUpperCase() === assetSymbol) || null,
    [assets, assetSymbol]
  );

  const balanceDecimal = useMemo(() => safeDecimal(walletAsset?.balance), [walletAsset?.balance]);
  const minDepositDecimal = useMemo(
    () => (selectedPlan?.min_deposit ? safeDecimal(selectedPlan.min_deposit) : null),
    [selectedPlan?.min_deposit]
  );

  useEffect(() => {
    if (!selectedPlan) {
      setAmountError('');
      return;
    }
    const trimmed = amount.trim();
    if (!trimmed) {
      setAmountError('');
      return;
    }
    try {
      const value = new Decimal(trimmed);
      if (!value.isFinite() || value.lte(0)) {
        setAmountError('القيمة المدخلة غير صالحة.');
        return;
      }
      if (minDepositDecimal && value.lt(minDepositDecimal)) {
        setAmountError(
          `الحد الأدنى للاستاكينج هو ${formatDecimal(minDepositDecimal, 6)} ${assetSymbol}.`
        );
        return;
      }
      if (value.gt(balanceDecimal)) {
        setAmountError('رصيدك مش كافي للكمية دي.');
        return;
      }
      setAmountError('');
    } catch {
      setAmountError('القيمة المدخلة غير صالحة.');
    }
  }, [amount, selectedPlan, minDepositDecimal, balanceDecimal, assetSymbol]);

  const aprPercent = selectedPlan ? selectedPlan.apr_bps / 100 : 0;

  const estimatedDaily = useMemo(() => {
    if (!selectedPlan) return null;
    const trimmed = amount.trim();
    if (!trimmed) return null;
    try {
      const value = new Decimal(trimmed);
      if (!value.isFinite() || value.lte(0)) return null;
      const aprDecimal = new Decimal(selectedPlan.apr_bps || 0).div(10000).div(365);
      return value.mul(aprDecimal);
    } catch {
      return null;
    }
  }, [amount, selectedPlan]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !amount.trim() || amountError) return;
    setSubmitting(true);
    setError('');
    const res = await apiFetch<{ id: number }>('/staking/positions', {
      method: 'POST',
      body: JSON.stringify({ planId: selectedPlan.id, amount }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const code = (res.data as any)?.error?.code;
      setError(`${res.error || 'تعذر تنفيذ العملية.'}${code ? ` (${code})` : ''}`.trim());
    } else {
      router.push('/earn/staking/positions');
    }
  };

  return (
    <div className="p-4 flex justify-center">
      <form
        onSubmit={submit}
        className="space-y-5 w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">استاكينج ELTX</h1>
          <p className="text-sm opacity-70">
            اقفل رصيدك لفترة محددة علشان تكسب عائد ثابت على عملة {assetSymbol}.
          </p>
        </div>

        {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded p-2">{error}</div>}

        {loading && plans.length === 0 ? (
          <div className="text-sm opacity-70">جاري تحميل خطط الاستاكينج…</div>
        ) : plans.length === 0 ? (
          <div className="text-sm opacity-70">مافيش خطط متاحة دلوقتي.</div>
        ) : (
          <>
            <div>
              <label className="block text-xs mb-1 opacity-70">اختر الخطة</label>
              <select
                value={planId ?? ''}
                onChange={(e) => setPlanId(Number(e.target.value))}
                className="w-full p-2 rounded bg-black/20 border border-white/20 hover:bg-black/30 transition"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.duration_days} يوم · APR {formatDecimal(p.apr_bps / 100, 2)}%
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg bg-black/20 border border-white/10 p-3 text-sm space-y-1">
              <div>
                <span className="opacity-70">الرصيد المتاح:</span>{' '}
                <span className="font-semibold">{formatDecimal(balanceDecimal, 6)}</span>{' '}
                {assetSymbol}
              </div>
              {minDepositDecimal && (
                <div className="opacity-70">
                  الحد الأدنى للدخول: {formatDecimal(minDepositDecimal, 6)} {assetSymbol}
                </div>
              )}
              <div className="opacity-70">العائد السنوي (APR): {formatDecimal(aprPercent, 2)}%</div>
            </div>

            <div>
              <label className="block text-xs mb-1 opacity-70">الكمية اللي هتستاكها</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`مثال: 100 ${assetSymbol}`}
                className="w-full p-2 rounded bg-black/20 border border-white/20 hover:bg-black/30 transition"
                inputMode="decimal"
              />
              {amountError && <div className="text-xs text-red-400 mt-1">{amountError}</div>}
            </div>

            {estimatedDaily && (
              <div className="text-sm bg-amber-500/10 border border-amber-500/40 rounded p-2">
                العائد اليومي المتوقع: {formatDecimal(estimatedDaily, 6)} {assetSymbol}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full justify-center disabled:opacity-60"
              disabled={submitting || !selectedPlan || !amount.trim() || !!amountError}
            >
              {submitting ? 'جاري التنفيذ…' : 'ابدأ الاستاكينج'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
