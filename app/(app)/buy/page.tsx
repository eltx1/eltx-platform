'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Decimal from 'decimal.js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { CreditCard, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { formatWei } from '../../lib/format';

type FiatRateResponse = {
  ok: boolean;
  pricing: {
    asset: string;
    price_eltx: string;
    min_usd: string;
    max_usd: string | null;
    updated_at?: string | null;
  } | null;
  stripe: {
    enabled: boolean;
    publishableKey?: string | null;
  };
};

type FiatSessionResponse = {
  ok: boolean;
  sessionId: string;
  publishableKey?: string | null;
  limits: { min_usd: string; max_usd: string | null };
  quote: { price_eltx: string; eltx_amount: string; eltx_amount_wei: string; usd_amount: string };
};

type FiatPurchase = {
  id: number;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'expired' | 'refunded';
  usd_amount: string;
  usd_amount_minor: number;
  price_eltx: string;
  eltx_amount: string;
  eltx_amount_wei: string;
  credited: boolean;
  stripe_payment_intent_id?: string | null;
  stripe_session_id?: string | null;
  amount_charged_minor?: number | null;
  created_at: string;
  completed_at?: string | null;
  credited_at?: string | null;
};

type FiatPurchasesResponse = {
  ok: boolean;
  purchases: FiatPurchase[];
};

type FiatSessionLookup = {
  ok: boolean;
  purchase: FiatPurchase;
};

const stripeCache = new Map<string, Promise<Stripe | null>>();

async function getStripeInstance(key: string | null | undefined) {
  if (!key) return null;
  if (!stripeCache.has(key)) {
    stripeCache.set(key, loadStripe(key));
  }
  return stripeCache.get(key) ?? null;
}

function normalizeUsdInput(value: string) {
  return value.replace(/[^0-9.]/g, '');
}

const STATUS_THEME: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/40',
  succeeded: 'bg-green-500/10 text-green-200 border border-green-500/40',
  failed: 'bg-red-500/10 text-red-200 border border-red-500/40',
  canceled: 'bg-slate-500/10 text-slate-200 border border-slate-500/40',
  expired: 'bg-slate-500/10 text-slate-200 border border-slate-500/40',
  refunded: 'bg-purple-500/10 text-purple-200 border border-purple-500/40',
};

export default function BuyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const t = dict[lang];

  const [usdAmount, setUsdAmount] = useState('100');
  const [rate, setRate] = useState<FiatRateResponse['pricing']>(null);
  const [loadingRate, setLoadingRate] = useState(true);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripeKey, setStripeKey] = useState<string | null>(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null
  );
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<FiatPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<{
    status: 'pending' | 'succeeded' | null;
    purchase?: FiatPurchase | null;
  }>({ status: null, purchase: null });

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }),
    []
  );
  const eltxFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }),
    []
  );

  const minUsd = useMemo(() => {
    if (!rate?.min_usd) return null;
    try {
      const val = new Decimal(rate.min_usd);
      return val.isFinite() ? val : null;
    } catch {
      return null;
    }
  }, [rate?.min_usd]);

  const maxUsd = useMemo(() => {
    if (!rate?.max_usd) return null;
    try {
      const val = new Decimal(rate.max_usd);
      return val.isFinite() ? val : null;
    } catch {
      return null;
    }
  }, [rate?.max_usd]);

  const parsedAmount = useMemo(() => {
    try {
      const normalized = usdAmount.trim();
      if (!normalized) return null;
      const dec = new Decimal(normalized);
      if (!dec.isFinite()) return null;
      return dec;
    } catch {
      return null;
    }
  }, [usdAmount]);

  const estimatedEltx = useMemo(() => {
    if (!parsedAmount || !rate?.price_eltx) return '0';
    try {
      const price = new Decimal(rate.price_eltx || '0');
      if (!price.isFinite()) return '0';
      const result = parsedAmount.mul(price);
      return result.toFixed(6);
    } catch {
      return '0';
    }
  }, [parsedAmount, rate?.price_eltx]);

  const amountValid = useMemo(() => {
    if (!parsedAmount) return false;
    if (parsedAmount.lte(0)) return false;
    if (minUsd && parsedAmount.lt(minUsd)) return false;
    if (maxUsd && parsedAmount.gt(maxUsd)) return false;
    return true;
  }, [parsedAmount, minUsd, maxUsd]);

  const loadRate = useCallback(async () => {
    setLoadingRate(true);
    const res = await apiFetch<FiatRateResponse>('/fiat/stripe/rate');
    if (res.ok) {
      setRate(res.data.pricing);
      setStripeEnabled(res.data.stripe?.enabled ?? false);
      const incomingKey = res.data.stripe?.publishableKey || null;
      if (incomingKey) setStripeKey(incomingKey);
    } else {
      setRate(null);
      setStripeEnabled(false);
      setError(res.error || t.common.genericError);
    }
    setLoadingRate(false);
  }, [t.common.genericError]);

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    const res = await apiFetch<FiatPurchasesResponse>('/fiat/stripe/purchases');
    if (res.ok) {
      setPurchases(res.data.purchases || []);
    }
    setLoadingPurchases(false);
  }, []);

  const checkSession = useCallback(
    async (sessionId: string) => {
      const res = await apiFetch<FiatSessionLookup>(`/fiat/stripe/session/${sessionId}`);
      if (res.ok) {
        const purchase = res.data.purchase;
        if (purchase.status === 'succeeded') {
          setSessionFeedback({ status: 'succeeded', purchase });
        } else {
          setSessionFeedback({ status: 'pending', purchase });
        }
      } else {
        setSessionFeedback({ status: null, purchase: null });
      }
    },
    []
  );

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    loadRate();
    loadPurchases();
    const interval = setInterval(loadPurchases, 15000);
    return () => clearInterval(interval);
  }, [user, loadRate, loadPurchases]);

  useEffect(() => {
    if (!searchParams) return;
    const status = searchParams.get('status');
    const sessionId = searchParams.get('session_id');
    if (!status) return;
    if (status === 'success' && sessionId) {
      checkSession(sessionId).finally(() => {
        loadPurchases();
        router.replace('/buy', { scroll: false });
      });
    } else if (status === 'cancelled') {
      setError(t.buy.errors.checkoutFailed);
      router.replace('/buy', { scroll: false });
    }
  }, [searchParams, router, checkSession, loadPurchases, t.buy.errors.checkoutFailed]);

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const sanitized = normalizeUsdInput(event.target.value);
    setUsdAmount(sanitized);
  };

  const handleCheckout = async () => {
    setError(null);
    setSessionFeedback({ status: null, purchase: null });
    if (!stripeEnabled) {
      setError(t.buy.errors.stripeUnavailable);
      return;
    }
    if (!rate?.price_eltx) {
      setError(t.common.genericError);
      return;
    }
    if (!parsedAmount) {
      setError(t.buy.errors.amountRequired);
      return;
    }
    if (parsedAmount.lte(0)) {
      setError(t.buy.errors.amountInvalid);
      return;
    }
    if (minUsd && parsedAmount.lt(minUsd)) {
      setError(t.buy.errors.amountTooSmall.replace('{min}', minUsd.toFixed(2)));
      return;
    }
    if (maxUsd && parsedAmount.gt(maxUsd)) {
      setError(t.buy.errors.amountTooLarge.replace('{max}', maxUsd.toFixed(2)));
      return;
    }

    const normalizedUsd = parsedAmount.toFixed(2, Decimal.ROUND_HALF_UP);
    setLoadingCheckout(true);
    const res = await apiFetch<FiatSessionResponse>('/fiat/stripe/session', {
      method: 'POST',
      body: JSON.stringify({ amount_usd: normalizedUsd, expected_price_eltx: rate.price_eltx }),
    });
    setLoadingCheckout(false);
    if (!res.ok) {
      setError(res.error || t.common.genericError);
      return;
    }
    const publishable = res.data.publishableKey || stripeKey;
    if (res.data.publishableKey) setStripeKey(res.data.publishableKey);
    const stripe = await getStripeInstance(publishable);
    if (!stripe) {
      setError(t.buy.errors.checkoutFailed);
      return;
    }
    const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: res.data.sessionId });
    if (stripeError) {
      setError(stripeError.message || t.buy.errors.checkoutFailed);
    }
  };

  if (user === undefined) {
    return <div className="p-6 text-white/70">Loading…</div>;
  }
  if (user === null) {
    return <div className="p-6 text-white/70">{t.trade.signInRequired}</div>;
  }

  const stripeReady = stripeEnabled && (stripeKey?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-indigo-500/20 p-3">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t.buy.title}</h1>
            <p className="text-sm text-white/70">{t.buy.subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-white/60">{t.buy.intro}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-wide text-white/60">{t.buy.amountLabel}</span>
            <input
              type="text"
              inputMode="decimal"
              value={usdAmount}
              onChange={handleAmountChange}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-lg focus:border-indigo-400 focus:outline-none"
              placeholder="100"
              disabled={!stripeReady || loadingCheckout}
            />
            <div className="text-xs text-white/50">
              {minUsd && (
                <span>
                  {t.buy.errors.amountTooSmall.replace('{min}', minUsd.toFixed(2))}
                  {maxUsd ? ' · ' : ''}
                </span>
              )}
              {maxUsd && (
                <span>{t.buy.errors.amountTooLarge.replace('{max}', maxUsd.toFixed(2))}</span>
              )}
            </div>
          </label>
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wide text-white/60">{t.buy.receiveLabel}</span>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-lg">
              {eltxFormatter.format(Number(estimatedEltx || '0'))} ELTX
            </div>
            <div className="text-xs text-white/50">
              {t.buy.rateLabel}: {loadingRate ? '…' : `${eltxFormatter.format(Number(rate?.price_eltx || '0'))} ELTX / USD`}
            </div>
          </div>
        </div>

        <p className="text-xs text-white/50">{t.buy.feeNotice}</p>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {sessionFeedback.status === 'pending' && (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            <div>
              <div className="font-medium">{t.buy.pendingTitle}</div>
              <div className="text-xs text-yellow-200/80">{t.buy.pendingBody}</div>
            </div>
          </div>
        )}

        {sessionFeedback.status === 'succeeded' && (
          <div className="flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-100">
            <CheckCircle2 className="h-4 w-4" />
            <div>
              <div className="font-medium">{t.buy.successTitle}</div>
              <div className="text-xs text-green-200/80">{t.buy.successBody}</div>
            </div>
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={!stripeReady || !amountValid || loadingCheckout}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold shadow transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/10"
        >
          {loadingCheckout && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{stripeReady ? t.buy.payButton : t.buy.payButtonDisabled}</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">{t.buy.historyTitle}</h2>
          <button
            onClick={loadPurchases}
            disabled={loadingPurchases}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1 text-xs text-white/70 hover:border-white/20 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingPurchases ? 'animate-spin' : ''}`} />
            {t.buy.refresh}
          </button>
        </div>
        {purchases.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            {t.buy.empty}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5 text-white/70">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t.buy.table.date}</th>
                  <th className="px-4 py-3 text-left font-medium">{t.buy.table.amount}</th>
                  <th className="px-4 py-3 text-left font-medium">{t.buy.table.eltx}</th>
                  <th className="px-4 py-3 text-left font-medium">{t.buy.table.status}</th>
                  <th className="px-4 py-3 text-left font-medium">{t.buy.table.reference}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {purchases.map((purchase) => {
                  const statusKey = purchase.status || 'pending';
                  const label =
                    (t.buy.status as Record<string, string>)[statusKey] || purchase.status;
                  const badgeClass = STATUS_THEME[statusKey] || 'bg-white/10 text-white';
                  const created = new Date(purchase.created_at);
                  const reference = purchase.stripe_payment_intent_id || purchase.stripe_session_id || '-';
                  const eltxDisplay = purchase.eltx_amount
                    ? eltxFormatter.format(Number(purchase.eltx_amount))
                    : formatWei(purchase.eltx_amount_wei, 18);
                  return (
                    <tr key={purchase.id} className="bg-black/20">
                      <td className="px-4 py-3 align-top text-white/80">
                        <div>{created.toLocaleString()}</div>
                        {purchase.completed_at && (
                          <div className="text-xs text-white/40">
                            {new Date(purchase.completed_at).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-white/80">
                        <div>{currencyFormatter.format(purchase.usd_amount_minor / 100)}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-white/80">{eltxDisplay}</td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${badgeClass}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-white/50 break-all">
                        {reference || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60 space-y-1">
          <div>{t.buy.info.autoCredit}</div>
          <div>{t.buy.info.processingTime}</div>
        </div>
      </div>
    </div>
  );
}
