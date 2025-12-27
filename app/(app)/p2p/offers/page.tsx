'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw, Trash2 } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';

type OfferPaymentMethod = { id: number; name: string };

type OfferRow = {
  id: number;
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

export default function MyP2POffersPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const statusLabels = useMemo(() => t.p2p.offerStatuses || {}, [t.p2p.offerStatuses]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ offers: OfferRow[] }>('/p2p/offers/mine');
    if (res.ok) {
      setOffers(res.data.offers || []);
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
    setLoading(false);
  }, [toast, t.common.genericError]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelOffer = async (offerId: number) => {
    if (cancellingId) return;
    const confirmed = window.confirm(t.p2p.myOffers.cancelConfirm);
    if (!confirmed) return;
    setCancellingId(offerId);
    const res = await apiFetch<{ offer: OfferRow }>(`/p2p/offers/${offerId}/cancel`, { method: 'POST' });
    setCancellingId(null);
    if (res.ok) {
      setOffers((prev) => prev.map((offer) => (offer.id === offerId ? res.data.offer : offer)));
      toast({ message: t.p2p.myOffers.cancelled, variant: 'success' });
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

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

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">{t.p2p.myOffers.kicker}</p>
          <h1 className="text-xl font-semibold">{t.p2p.myOffers.title}</h1>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t.common.refresh}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
        <Link
          href="/p2p"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 hover:text-white"
        >
          {t.p2p.tabs.p2p} <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/p2p/offers/new"
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-emerald-100 hover:border-emerald-300 hover:text-white"
        >
          {t.p2p.actions.addOffer}
        </Link>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5">
        {loading ? (
          <div className="p-6 text-sm text-white/60">{t.p2p.loading}</div>
        ) : offers.length ? (
          <ul className="divide-y divide-white/10">
            {offers.map((offer) => (
              <li key={offer.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase text-white/50">
                    <span>{offer.side === 'buy' ? t.p2p.tradeSide.buy : t.p2p.tradeSide.sell}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold">
                      {statusLabels[offer.status as keyof typeof statusLabels] || offer.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {offer.asset} · ${formatFiat(offer.price)} / {offer.asset}
                  </div>
                  <div className="text-xs text-white/60">
                    {t.p2p.stats.limit} {offer.min_limit} - {offer.max_limit} {offer.currency}
                  </div>
                  <div className="text-xs text-white/60">
                    {t.p2p.stats.available} {formatAssetAmount(offer.available_amount)} / {formatAssetAmount(offer.total_amount)} {offer.asset}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-white/60">
                    {offer.payment_methods.map((method) => (
                      <span key={method.id} className="rounded-full border border-white/10 px-2 py-0.5">
                        {method.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/p2p"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
                  >
                    {t.p2p.tabs.p2p}
                  </Link>
                  <button
                    type="button"
                    disabled={offer.status !== 'active' || cancellingId === offer.id}
                    onClick={() => cancelOffer(offer.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-400/70 px-3 py-1 text-xs font-semibold text-red-200 transition hover:border-red-300 hover:text-white disabled:border-white/10 disabled:text-white/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    {cancellingId === offer.id ? t.p2p.loading : t.p2p.myOffers.cancel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-sm text-white/60">{t.p2p.myOffers.empty}</div>
        )}
      </div>
    </div>
  );
}
