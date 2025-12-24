'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldPlus, WalletMinimal } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { dict, useLang } from '../../../../lib/i18n';
import { useToast } from '../../../../lib/toast';

type PaymentMethod = {
  id: number;
  name: string;
  dispute_delay_hours: number;
};

type OfferFormState = {
  side: 'buy' | 'sell';
  asset: 'USDC' | 'USDT';
  currency: string;
  price: string;
  min_limit: string;
  max_limit: string;
  total_amount: string;
  payment_method_ids: number[];
};

const INITIAL_FORM: OfferFormState = {
  side: 'buy',
  asset: 'USDC',
  currency: 'USD',
  price: '',
  min_limit: '',
  max_limit: '',
  total_amount: '',
  payment_method_ids: [],
};

export default function NewOfferPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState<OfferFormState>(INITIAL_FORM);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadPaymentMethods = useCallback(async () => {
    setLoadingMethods(true);
    const res = await apiFetch<{ methods: PaymentMethod[] }>('/p2p/payment-methods');
    if (res.ok) {
      setPaymentMethods(res.data.methods || []);
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
    setLoadingMethods(false);
  }, [toast, t.common.genericError]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  const updateField = <K extends keyof OfferFormState>(key: K, value: OfferFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const togglePayment = (id: number) => {
    setForm((prev) => {
      const exists = prev.payment_method_ids.includes(id);
      return {
        ...prev,
        payment_method_ids: exists ? prev.payment_method_ids.filter((pid) => pid !== id) : [...prev.payment_method_ids, id],
      };
    });
  };

  const paymentWarning = useMemo(() => {
    if (!form.payment_method_ids.length) return t.p2p.offerForm.validation.paymentRequired;
    return '';
  }, [form.payment_method_ids.length, t.p2p.offerForm.validation.paymentRequired]);

  const validate = () => {
    const price = Number(form.price);
    const min = Number(form.min_limit);
    const max = Number(form.max_limit);
    const total = Number(form.total_amount);
    if (!Number.isFinite(price) || price <= 0) return t.p2p.offerForm.validation.price;
    if (!Number.isFinite(min) || min <= 0) return t.p2p.offerForm.validation.min;
    if (!Number.isFinite(max) || max <= 0 || max < min) return t.p2p.offerForm.validation.max;
    if (!Number.isFinite(total) || total <= 0) return t.p2p.offerForm.validation.total;
    if (!form.payment_method_ids.length) return t.p2p.offerForm.validation.paymentRequired;
    return '';
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      toast({ message: validationError, variant: 'error' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch('/p2p/offers', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ message: t.p2p.offerForm.success, variant: 'success' });
      setForm(INITIAL_FORM);
      router.push('/p2p');
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-white/10 bg-white/5 p-2 text-white/80 transition hover:text-white"
          aria-label={t.common.back}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">{t.p2p.offerForm.kicker}</p>
          <h1 className="text-xl font-semibold text-white">{t.p2p.offerForm.title}</h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-white/80">
              <span className="text-xs text-white/60">{t.p2p.offerForm.side}</span>
              <select
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                value={form.side}
                onChange={(event) => updateField('side', event.target.value as OfferFormState['side'])}
              >
                <option value="buy">{t.p2p.tradeSide.buy}</option>
                <option value="sell">{t.p2p.tradeSide.sell}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80">
              <span className="text-xs text-white/60">{t.p2p.offerForm.asset}</span>
              <select
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                value={form.asset}
                onChange={(event) => updateField('asset', event.target.value as OfferFormState['asset'])}
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80">
              <span className="text-xs text-white/60">{t.p2p.offerForm.currency}</span>
              <input
                value={form.currency}
                onChange={(event) => updateField('currency', event.target.value.toUpperCase())}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
                placeholder="USD"
                maxLength={8}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80">
              <span className="text-xs text-white/60">{t.p2p.offerForm.price}</span>
              <input
                value={form.price}
                onChange={(event) => updateField('price', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
                placeholder="1.00"
                inputMode="decimal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80">
              <span className="text-xs text-white/60">{t.p2p.offerForm.min}</span>
              <input
                value={form.min_limit}
                onChange={(event) => updateField('min_limit', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
                placeholder="50"
                inputMode="decimal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80">
              <span className="text-xs text-white/60">{t.p2p.offerForm.max}</span>
              <input
                value={form.max_limit}
                onChange={(event) => updateField('max_limit', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
                placeholder="1000"
                inputMode="decimal"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/80 sm:col-span-2">
              <span className="text-xs text-white/60">{t.p2p.offerForm.total}</span>
              <input
                value={form.total_amount}
                onChange={(event) => updateField('total_amount', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
                placeholder="500"
                inputMode="decimal"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <WalletMinimal className="h-5 w-5 text-emerald-400" />
              {t.p2p.offerForm.paymentMethods}
            </div>
            {loadingMethods ? (
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.p2p.loading}
              </div>
            ) : paymentMethods.length ? (
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((method) => {
                  const active = form.payment_method_ids.includes(method.id);
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => togglePayment(method.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-emerald-400/70 bg-emerald-500/10 text-emerald-100'
                          : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {method.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70">
                {t.p2p.offers.empty}
              </div>
            )}
            {paymentWarning && <div className="text-xs text-amber-200">{paymentWarning}</div>}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.push('/p2p')}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:text-white"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.p2p.offerForm.submit}
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldPlus className="h-5 w-5 text-fuchsia-300" />
            {t.p2p.offerForm.help.title}
          </div>
          <ul className="list-disc space-y-2 pl-5 text-white/70">
            <li>{t.p2p.offerForm.help.price}</li>
            <li>{t.p2p.offerForm.help.limits}</li>
            <li>{t.p2p.offerForm.help.total}</li>
            <li>{t.p2p.offerForm.help.payments}</li>
            <li>{t.p2p.offerForm.help.admin}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
