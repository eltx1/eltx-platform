'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, MessageCircle, PlusCircle, ShieldCheck, Star, Timer } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

type PaymentMethod = {
  id: number;
  name: string;
  dispute_delay_hours: number;
};

type Offer = {
  id: number;
  side: 'buy' | 'sell';
  asset: 'USDC' | 'USDT';
  currency: string;
  price: string;
  min_limit: string;
  max_limit: string;
  total_amount: string;
  available_amount: string;
  status: string;
  user: { id: number; username: string };
  payment_methods: Array<{ id: number; name: string }>;
};

const statuses = ['initiated', 'paymentPending', 'paid', 'released', 'completed', 'disputed'] as const;

export default function P2PPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const router = useRouter();

  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState<'USDC' | 'USDT'>('USDC');
  const [amount, setAmount] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [selectedPayments, setSelectedPayments] = useState<number[]>([]);
  const [paymentFilterOpen, setPaymentFilterOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({
    side: 'sell',
    asset: 'USDC',
    price: '',
    min_limit: '',
    max_limit: '',
    total_amount: '',
    payment_method_ids: [] as number[],
  });
  const [tradeAmounts, setTradeAmounts] = useState<Record<number, string>>({});

  const loadPaymentMethods = useCallback(async () => {
    const res = await apiFetch<{ methods: PaymentMethod[] }>('/p2p/payment-methods');
    if (res.ok) {
      setMethods(res.data.methods || []);
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  }, [toast, t.common.genericError]);

  const loadOffers = useCallback(async () => {
    setLoadingOffers(true);
    const params = new URLSearchParams();
    params.set('side', tradeSide);
    params.set('asset', asset);
    if (amount.trim()) params.set('amount', amount.trim());
    if (selectedPayments.length) params.set('payment_method_id', String(selectedPayments[0]));
    const res = await apiFetch<{ offers: Offer[] }>(`/p2p/offers?${params.toString()}`);
    if (res.ok) {
      setOffers(res.data.offers || []);
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
    setLoadingOffers(false);
  }, [amount, asset, selectedPayments, toast, tradeSide, t.common.genericError]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const filteredPaymentMethods = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) return methods;
    return methods.filter((method) => method.name.toLowerCase().includes(query));
  }, [methods, paymentSearch]);

  const togglePayment = (methodId: number) => {
    setSelectedPayments((prev) =>
      prev.includes(methodId) ? prev.filter((item) => item !== methodId) : [...prev, methodId],
    );
  };

  const submitOffer = async () => {
    if (!offerForm.price || !offerForm.min_limit || !offerForm.max_limit || !offerForm.total_amount) {
      toast({ message: t.p2p.errors.missingOfferFields, variant: 'error' });
      return;
    }
    if (!offerForm.payment_method_ids.length) {
      toast({ message: t.p2p.errors.missingPaymentMethods, variant: 'error' });
      return;
    }
    const res = await apiFetch<{ offer: Offer }>(`/p2p/offers`, {
      method: 'POST',
      body: JSON.stringify({
        ...offerForm,
        side: offerForm.side as 'buy' | 'sell',
        asset: offerForm.asset as 'USDC' | 'USDT',
      }),
    });
    if (res.ok) {
      toast({ message: t.p2p.toasts.offerCreated, variant: 'success' });
      setOfferFormOpen(false);
      setOfferForm({
        side: offerForm.side,
        asset: offerForm.asset,
        price: '',
        min_limit: '',
        max_limit: '',
        total_amount: '',
        payment_method_ids: [],
      });
      loadOffers();
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  const createTrade = async (offerId: number) => {
    const amountValue = tradeAmounts[offerId];
    if (!amountValue) {
      toast({ message: t.p2p.errors.missingTradeAmount, variant: 'error' });
      return;
    }
    const methodId = selectedPayments[0] || offers.find((offer) => offer.id === offerId)?.payment_methods?.[0]?.id;
    if (!methodId) {
      toast({ message: t.p2p.errors.missingPaymentMethods, variant: 'error' });
      return;
    }
    const res = await apiFetch<{ trade: { id: number } }>(`/p2p/trades`, {
      method: 'POST',
      body: JSON.stringify({
        offer_id: offerId,
        amount: amountValue,
        payment_method_id: methodId,
      }),
    });
    if (res.ok) {
      toast({ message: t.p2p.toasts.tradeCreated, variant: 'success' });
      router.push(`/p2p/trades/${res.data.trade.id}`);
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/p2p/trades')}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 hover:text-white"
            >
              {t.p2p.actions.myTrades}
            </button>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              {t.p2p.currency}
            </div>
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
              onChange={(event) => setAsset(event.target.value as 'USDC' | 'USDT')}
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
          <button
            type="button"
            onClick={() => setPaymentFilterOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:text-white"
          >
            {t.p2p.filters.payment}
            <Filter className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOfferFormOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:text-white"
          >
            <PlusCircle className="h-4 w-4" />
            {t.p2p.actions.createOffer}
          </button>
        </div>
      </div>

      {offerFormOpen && (
        <div className="rounded-3xl border border-white/10 bg-[#121624] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{t.p2p.createOffer.title}</div>
            <button
              type="button"
              onClick={() => setOfferFormOpen(false)}
              className="text-xs text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-white/70">
              {t.p2p.createOffer.side}
              <select
                value={offerForm.side}
                onChange={(event) => setOfferForm((prev) => ({ ...prev, side: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="sell">{t.p2p.tradeSide.sell}</option>
                <option value="buy">{t.p2p.tradeSide.buy}</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-white/70">
              {t.p2p.createOffer.asset}
              <select
                value={offerForm.asset}
                onChange={(event) => setOfferForm((prev) => ({ ...prev, asset: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-white/70">
              {t.p2p.createOffer.price}
              <input
                value={offerForm.price}
                onChange={(event) => setOfferForm((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="1.00"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-xs text-white/70">
              {t.p2p.createOffer.totalAmount}
              <input
                value={offerForm.total_amount}
                onChange={(event) => setOfferForm((prev) => ({ ...prev, total_amount: event.target.value }))}
                placeholder="100.00"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-xs text-white/70">
              {t.p2p.createOffer.minLimit}
              <input
                value={offerForm.min_limit}
                onChange={(event) => setOfferForm((prev) => ({ ...prev, min_limit: event.target.value }))}
                placeholder="10.00"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1 text-xs text-white/70">
              {t.p2p.createOffer.maxLimit}
              <input
                value={offerForm.max_limit}
                onChange={(event) => setOfferForm((prev) => ({ ...prev, max_limit: event.target.value }))}
                placeholder="200.00"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="mt-4">
            <p className="text-xs text-white/60">{t.p2p.createOffer.paymentMethods}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {methods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() =>
                    setOfferForm((prev) => ({
                      ...prev,
                      payment_method_ids: prev.payment_method_ids.includes(method.id)
                        ? prev.payment_method_ids.filter((id) => id !== method.id)
                        : [...prev.payment_method_ids, method.id],
                    }))
                  }
                  className={`rounded-full border px-3 py-1 ${
                    offerForm.payment_method_ids.includes(method.id)
                      ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 text-white/70'
                  }`}
                >
                  {method.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOfferFormOpen(false)}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={submitOffer}
              className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-black"
            >
              {t.p2p.actions.publishOffer}
            </button>
          </div>
        </div>
      )}

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
              onClick={() => setSelectedPayments([])}
              className={`rounded-full border px-3 py-2 ${
                selectedPayments.length === 0
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 text-white/70'
              }`}
            >
              {t.p2p.filters.all}
            </button>
            {filteredPaymentMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => togglePayment(method.id)}
                className={`rounded-full border px-3 py-2 ${
                  selectedPayments.includes(method.id)
                    ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/10 text-white/70'
                }`}
              >
                {method.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedPayments([])}
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
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
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
                      {offer.status === 'active' && <Star className="h-4 w-4 text-amber-400" />}
                    </div>
                    <div className="text-xs text-white/60">
                      {t.p2p.stats.available} {offer.available_amount} {offer.asset}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => createTrade(offer.id)}
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
                  <div className="text-2xl font-semibold">${offer.price}</div>
                  <div className="text-xs text-white/50">/{offer.asset}</div>
                </div>
                <div className="text-sm text-white/70">
                  <div>
                    {t.p2p.stats.limit} {offer.min_limit} - {offer.max_limit} {offer.currency}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Timer className="h-4 w-4" />
                    {t.p2p.stats.orderTime} {t.p2p.stats.defaultOrderTime}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-white/50">{t.p2p.stats.tradeAmount}</span>
                    <input
                      value={tradeAmounts[offer.id] || ''}
                      onChange={(event) =>
                        setTradeAmounts((prev) => ({ ...prev, [offer.id]: event.target.value }))
                      }
                      placeholder={offer.min_limit}
                      className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
                    />
                    <span className="text-xs text-white/50">{offer.currency}</span>
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
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            {t.p2p.empty}
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
    </div>
  );
}
