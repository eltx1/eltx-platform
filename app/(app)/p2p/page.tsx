'use client';

import { useMemo, useState } from 'react';
import { Filter, MessageCircle, ShieldCheck, Star, Timer } from 'lucide-react';
import { dict, useLang } from '../../lib/i18n';

const paymentMethods = [
  'Bank Transfer',
  'Cash Deposit',
  'Wise',
  'Zelle',
  'Skrill',
  'AirTM',
  'Payoneer',
  'Revolut',
  'SEPA',
  'ACH',
  'Mobile Wallet',
  'PayPal',
];

const offers = [
  {
    id: 'realtrader',
    user: 'RealTrader-Dio',
    trades: 689,
    completion: 98.9,
    price: 1.05,
    asset: 'USDC',
    limitMin: 10,
    limitMax: 47,
    available: 44.8637,
    paymentMethods: ['Bank Transfer', 'AirTM', 'Wise'],
    orderTime: 15,
    side: 'buy',
    featured: true,
  },
  {
    id: 'aboali',
    user: '__AboAli_',
    trades: 457,
    completion: 95.5,
    price: 1.07,
    asset: 'USDC',
    limitMin: 10,
    limitMax: 631,
    available: 590.1913,
    paymentMethods: ['Cash Deposit', 'Mobile Wallet'],
    orderTime: 15,
    side: 'buy',
  },
  {
    id: 'elite-secure',
    user: 'EliteSecureReliable',
    trades: 2054,
    completion: 100,
    price: 1.08,
    asset: 'USDC',
    limitMin: 20,
    limitMax: 1000,
    available: 1496.3339,
    paymentMethods: ['AirTM', 'Bank Transfer'],
    orderTime: 15,
    side: 'buy',
  },
  {
    id: 'wise-pay',
    user: 'rachidfrg_wispayoner',
    trades: 407,
    completion: 97.4,
    price: 1.09,
    asset: 'USDC',
    limitMin: 200,
    limitMax: 1087,
    available: 997.9109,
    paymentMethods: ['Skrill', 'Bank Transfer', 'Wise'],
    orderTime: 15,
    side: 'buy',
  },
  {
    id: 'zelle-fast',
    user: 'ZelleFastDesk',
    trades: 954,
    completion: 99.1,
    price: 1.03,
    asset: 'USDT',
    limitMin: 50,
    limitMax: 800,
    available: 250.12,
    paymentMethods: ['Zelle', 'Bank Transfer'],
    orderTime: 10,
    side: 'buy',
  },
  {
    id: 'pro-seller',
    user: 'ProSeller-ALX',
    trades: 1304,
    completion: 98.4,
    price: 1.04,
    asset: 'USDT',
    limitMin: 100,
    limitMax: 900,
    available: 874.55,
    paymentMethods: ['Wise', 'SEPA'],
    orderTime: 20,
    side: 'sell',
    featured: true,
  },
  {
    id: 'bank-only',
    user: 'BankOnlyOTC',
    trades: 311,
    completion: 96.1,
    price: 1.06,
    asset: 'USDC',
    limitMin: 75,
    limitMax: 500,
    available: 312.88,
    paymentMethods: ['Bank Transfer', 'ACH'],
    orderTime: 30,
    side: 'sell',
  },
  {
    id: 'wallet-cash',
    user: 'CashBridge',
    trades: 189,
    completion: 94.3,
    price: 1.02,
    asset: 'USDT',
    limitMin: 25,
    limitMax: 350,
    available: 410.5,
    paymentMethods: ['Cash Deposit', 'Mobile Wallet'],
    orderTime: 25,
    side: 'sell',
  },
];

const statuses = ['initiated', 'paymentPending', 'paid', 'released', 'completed', 'disputed'] as const;

export default function P2PPage() {
  const { lang } = useLang();
  const t = dict[lang];

  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [paymentFilterOpen, setPaymentFilterOpen] = useState(false);

  const filteredPaymentMethods = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) return paymentMethods;
    return paymentMethods.filter((method) => method.toLowerCase().includes(query));
  }, [paymentSearch]);

  const filteredOffers = useMemo(() => {
    const amountValue = Number(amount);
    return offers.filter((offer) => {
      if (offer.side !== tradeSide) return false;
      if (offer.asset !== asset) return false;
      if (selectedPayments.length > 0 && !offer.paymentMethods.some((method) => selectedPayments.includes(method))) {
        return false;
      }
      if (amount.trim().length === 0) return true;
      if (!Number.isFinite(amountValue) || amountValue <= 0) return false;
      return amountValue >= offer.limitMin && amountValue <= offer.limitMax;
    });
  }, [tradeSide, asset, selectedPayments, amount]);

  const togglePayment = (method: string) => {
    setSelectedPayments((prev) =>
      prev.includes(method) ? prev.filter((item) => item !== method) : [...prev, method],
    );
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
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
            {t.p2p.currency}
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
          <button
            type="button"
            onClick={() => setPaymentFilterOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:text-white"
          >
            {t.p2p.filters.payment}
            <Filter className="h-4 w-4" />
          </button>
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
                key={method}
                type="button"
                onClick={() => togglePayment(method)}
                className={`rounded-full border px-3 py-2 ${
                  selectedPayments.includes(method)
                    ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/10 text-white/70'
                }`}
              >
                {method}
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
        {filteredOffers.map((offer) => (
          <div key={offer.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {offer.user}
                    {offer.featured && <Star className="h-4 w-4 text-amber-400" />}
                  </div>
                  <div className="text-xs text-white/60">
                    {t.p2p.stats.trades} {offer.trades} ({offer.completion.toFixed(2)}%) ·{' '}
                    {t.p2p.stats.completion} {offer.completion.toFixed(2)}%
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={`rounded-full px-5 py-2 text-sm font-semibold ${
                  tradeSide === 'buy' ? 'bg-emerald-500 text-black' : 'bg-fuchsia-500 text-white'
                }`}
              >
                {tradeSide === 'buy' ? t.p2p.actions.buy : t.p2p.actions.sell}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <div className="text-xs uppercase text-white/40">Price</div>
                <div className="text-2xl font-semibold">${offer.price.toFixed(2)}</div>
                <div className="text-xs text-white/50">/{offer.asset}</div>
              </div>
              <div className="text-sm text-white/70">
                <div>
                  {t.p2p.stats.limit} {offer.limitMin} - {offer.limitMax} {t.p2p.currency}
                </div>
                <div>
                  {t.p2p.stats.available} {offer.available.toFixed(4)} {offer.asset}
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Timer className="h-4 w-4" />
                  {t.p2p.stats.orderTime} {offer.orderTime} min
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                {offer.paymentMethods.map((method) => (
                  <span key={method} className="rounded-full border border-white/10 px-2 py-1">
                    {method}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
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
