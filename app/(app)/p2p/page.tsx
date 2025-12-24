'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Filter, Loader2, MessageCircle, PlusCircle, ShieldCheck, Star, Timer } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

type OfferPaymentMethod = { id: number; name: string };

type Offer = {
  id: number;
  user: { id: number; username: string };
  side: 'buy' | 'sell';
  asset: string;
  currency: string;
  price: string;
  min_limit: string;
  max_limit: string;
  total_amount: string;
  available_amount: string;
  status: string;
  payment_methods: OfferPaymentMethod[];
};

type PaymentMethod = {
  id: number;
  name: string;
  dispute_delay_hours: number;
};

const statuses = ['initiated', 'payment_pending', 'paid', 'released', 'completed', 'disputed'] as const;

export default function P2PPage() {
  const router = useRouter();
  const toast = useToast();
  const { lang } = useLang();
  const t = dict[lang];

  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [paymentFilterOpen, setPaymentFilterOpen] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [offersError, setOffersError] = useState('');

  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradePaymentMethodId, setTradePaymentMethodId] = useState<number | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);

  const oppositeSide = tradeSide === 'buy' ? 'sell' : 'buy';

  const normalizedAmount = amount.trim();
  const amountFilter = useMemo(() => {
    const numeric = Number(normalizedAmount);
    if (!normalizedAmount || !Number.isFinite(numeric) || numeric <= 0) return '';
    return normalizedAmount;
  }, [normalizedAmount]);

  const filteredPaymentMethods = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) return paymentMethods;
    return paymentMethods.filter((method) => method.name.toLowerCase().includes(query));
  }, [paymentMethods, paymentSearch]);

  const selectedPaymentName = useMemo(
    () => paymentMethods.find((pm) => pm.id === selectedPaymentId)?.name || null,
    [paymentMethods, selectedPaymentId]
  );

  const formatFiat = (value: string, fraction = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return num.toLocaleString(undefined, { minimumFractionDigits: fraction, maximumFractionDigits: fraction });
  };

  const formatAssetAmount = (value: string) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return num.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

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

  const loadOffers = useCallback(async () => {
    setLoadingOffers(true);
    setOffersError('');
    const params = new URLSearchParams();
    params.set('side', oppositeSide);
    params.set('asset', asset);
    if (amountFilter) params.set('amount', amountFilter);
    if (selectedPaymentId) params.set('payment_method_id', String(selectedPaymentId));
    const res = await apiFetch<{ offers: Offer[] }>(`/p2p/offers${params.toString() ? `?${params.toString()}` : ''}`);
    setLoadingOffers(false);
    if (res.ok) {
      setOffers(res.data.offers || []);
    } else {
      setOffers([]);
      setOffersError(res.error || t.common.genericError);
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  }, [asset, amountFilter, oppositeSide, selectedPaymentId, t.common.genericError, toast]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadOffers();
    }, 300);
    return () => clearTimeout(handle);
  }, [loadOffers]);

  const resetFilters = () => {
    setAmount('');
    setSelectedPaymentId(null);
    setPaymentSearch('');
  };

  const openTrade = (offer: Offer) => {
    setSelectedOffer(offer);
    const defaultPayment =
      (selectedPaymentId && offer.payment_methods.find((pm) => pm.id === selectedPaymentId)?.id) ||
      offer.payment_methods[0]?.id ||
      null;
    setTradePaymentMethodId(defaultPayment);
    setTradeAmount(amountFilter || offer.min_limit || '');
  };

  const closeTrade = () => {
    setSelectedOffer(null);
    setTradeAmount('');
    setTradePaymentMethodId(null);
    setTradeLoading(false);
  };

  const startTrade = async () => {
    if (!selectedOffer) return;
    const normalized = tradeAmount.trim();
    if (!normalized) {
      toast({ message: t.p2p.errors.amount, variant: 'error' });
      return;
    }
    const numeric = Number(normalized);
    const min = Number(selectedOffer.min_limit);
    const max = Number(selectedOffer.max_limit);
    if (!Number.isFinite(numeric) || numeric <= 0 || (Number.isFinite(min) && numeric < min) || (Number.isFinite(max) && numeric > max)) {
      toast({ message: t.p2p.errors.amount, variant: 'error' });
      return;
    }
    if (!tradePaymentMethodId) {
      toast({ message: t.p2p.errors.paymentMethod, variant: 'error' });
      return;
    }
    setTradeLoading(true);
    const res = await apiFetch<{ trade: { id: number } }>('/p2p/trades', {
      method: 'POST',
      body: JSON.stringify({
        offer_id: selectedOffer.id,
        amount: normalized,
        payment_method_id: tradePaymentMethodId,
      }),
    });
    setTradeLoading(false);
    if (res.ok) {
      toast({ message: t.p2p.toasts.tradeCreated, variant: 'success' });
      closeTrade();
      if (res.data?.trade?.id) {
        router.push(`/p2p/trades/${res.data.trade.id}`);
      } else {
        loadOffers();
      }
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm font-semibold">
            <button type="button" className="text-white/70 hover:text-white/90">
              {t.p2p.tabs.express}
            </button>
            <button
              type="button"
              className="rounded-full bg-white/10 px-3 py-1 text-white shadow-inner shadow-black/30"
            >
              {t.p2p.tabs.p2p}
            </button>
            <button type="button" className="text-white/70 hover:text-white/90">
              {t.p2p.tabs.block}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              {t.p2p.currency}
            </div>
            <Link
              href="/p2p/offers/new"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/70 hover:text-white"
            >
              <PlusCircle className="h-4 w-4" /> {t.p2p.actions.addOffer}
            </Link>
            <Link
              href="/p2p/trades"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 transition hover:text-white"
            >
              {t.p2p.actions.viewTrades}
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-full bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setTradeSide('buy')}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              tradeSide === 'buy' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
            }`}
          >
            {t.p2p.tradeSide.buy}
          </button>
          <button
            type="button"
            onClick={() => setTradeSide('sell')}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              tradeSide === 'sell' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
            }`}
          >
            {t.p2p.tradeSide.sell}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="text-white/60">{t.p2p.filters.asset}</span>
            <select
              className="bg-transparent text-white"
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            >
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          <div className="flex flex-1 min-w-[160px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="text-white/60">{t.p2p.filters.amount}</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-white placeholder:text-white/30"
              inputMode="decimal"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaymentFilterOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:text-white"
            >
              {selectedPaymentName ? `${t.p2p.filters.payment}: ${selectedPaymentName}` : t.p2p.filters.payment}
              <Filter className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={loadOffers}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:text-white"
            >
              {loadingOffers ? <Loader2 className="h-4 w-4 animate-spin" /> : t.common.refresh}
            </button>
          </div>
        </div>
      </div>

      {paymentFilterOpen && (
        <div className="rounded-3xl border border-white/10 bg-[#121624] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{t.p2p.filters.receivedWith}</div>
            <button
              type="button"
              onClick={() => setPaymentFilterOpen(false)}
              className="text-xs text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
            <input
              value={paymentSearch}
              onChange={(event) => setPaymentSearch(event.target.value)}
              placeholder={t.p2p.filters.searchPayment}
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectedPaymentId(null)}
              className={`rounded-full border px-3 py-2 ${
                selectedPaymentId === null
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 text-white/70'
              }`}
            >
              {t.p2p.filters.all}
            </button>
            {loadingMethods ? (
              <div className="col-span-2 flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.p2p.loading}
              </div>
            ) : filteredPaymentMethods.length ? (
              filteredPaymentMethods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedPaymentId((prev) => (prev === method.id ? null : method.id))}
                  className={`rounded-full border px-3 py-2 ${
                    selectedPaymentId === method.id
                      ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 text-white/70'
                  }`}
                >
                  {method.name}
                </button>
              ))
            ) : (
              <div className="col-span-2 rounded-full border border-white/10 px-3 py-2 text-center text-white/70">
                {t.p2p.offers.empty}
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={resetFilters}
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:text-white"
            >
              {t.p2p.filters.reset}
            </button>
            <button
              type="button"
              onClick={() => setPaymentFilterOpen(false)}
              className="flex-1 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black"
            >
              {t.p2p.filters.confirm}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loadingOffers ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            {t.p2p.loading}
          </div>
        ) : offers.length ? (
          offers.map((offer) => (
            <div key={offer.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {offer.user.username}
                      <Star className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="text-xs text-white/60">
                      {t.p2p.stats.available} {formatAssetAmount(offer.available_amount)} {offer.asset}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openTrade(offer)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold ${
                    tradeSide === 'buy' ? 'bg-emerald-500 text-black' : 'bg-fuchsia-500 text-white'
                  }`}
                >
                  {tradeSide === 'buy' ? t.p2p.actions.buy : t.p2p.actions.sell}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
                <div>
                  <div className="text-xs uppercase text-white/40">{t.p2p.stats.price}</div>
                  <div className="text-2xl font-semibold">${formatFiat(offer.price)}</div>
                  <div className="text-xs text-white/50">/{offer.asset}</div>
                </div>
                <div className="text-sm text-white/70">
                  <div>
                    {t.p2p.stats.limit} {offer.min_limit} - {offer.max_limit} {offer.currency}
                  </div>
                  <div>
                    {t.p2p.stats.available} {formatAssetAmount(offer.available_amount)} {offer.asset}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Timer className="h-4 w-4" />
                    {t.p2p.stats.orderTime} {t.p2p.tradeSide[offer.side as 'buy' | 'sell']}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                  {offer.payment_methods.map((method) => (
                    <span key={method.id} className="rounded-full border border-white/10 px-2 py-1">
                      {method.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            {offersError || t.p2p.offers.empty}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            {t.p2p.protections.title}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>{t.p2p.protections.escrow}</li>
            <li>{t.p2p.protections.settlement}</li>
            <li>{t.p2p.protections.risk}</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-5 w-5 text-blue-400" />
            {t.p2p.info.chat}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>{t.p2p.info.supportedAssets}</li>
            <li>{t.p2p.info.sellerEligibility}</li>
            <li>{t.p2p.info.disputeTiming}</li>
            <li>{t.p2p.info.escrow}</li>
            <li>{t.p2p.info.adminPayments}</li>
          </ul>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold">{t.p2p.statuses.title}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statuses.map((status) => (
            <div key={status} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
              {t.p2p.statuses[status]}
            </div>
          ))}
        </div>
      </div>

      {selectedOffer && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0f1424] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-white/60">{t.p2p.form.title}</div>
                <div className="text-lg font-semibold text-white">
                  {tradeSide === 'buy' ? t.p2p.actions.buy : t.p2p.actions.sell} {selectedOffer.asset} · $
                  {formatFiat(selectedOffer.price)}
                </div>
                <div className="text-xs text-white/50">{selectedOffer.user.username}</div>
              </div>
              <button onClick={closeTrade} className="text-sm text-white/60 hover:text-white">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-white">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">{t.p2p.form.amount}</span>
                <input
                  value={tradeAmount}
                  onChange={(event) => setTradeAmount(event.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30"
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <span className="text-xs text-white/50">
                  {t.p2p.form.limits}: {selectedOffer.min_limit} - {selectedOffer.max_limit} {selectedOffer.currency}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">{t.p2p.form.payment}</span>
                <select
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  value={tradePaymentMethodId ?? ''}
                  onChange={(event) => setTradePaymentMethodId(Number(event.target.value) || null)}
                >
                  <option value="">{t.p2p.filters.all}</option>
                  {selectedOffer.payment_methods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeTrade}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:text-white"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={startTrade}
                disabled={tradeLoading}
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {tradeLoading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : t.p2p.form.submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
