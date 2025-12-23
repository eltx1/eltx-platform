'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';

type TradeRow = {
  id: number;
  asset: string;
  currency: string;
  price: string;
  amount: string;
  fiat_amount: string;
  status: string;
  buyer_id: number;
  seller_id: number;
  buyer_username: string;
  seller_username: string;
  payment_method_name: string;
  created_at: string;
};

export default function P2PTradesPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ trades: TradeRow[] }>('/p2p/trades');
    if (res.ok) {
      setTrades(res.data.trades || []);
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
    setLoading(false);
  }, [toast, t.common.genericError]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">{t.p2p.trades.kicker}</p>
          <h1 className="text-xl font-semibold">{t.p2p.trades.title}</h1>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t.common.refresh}
        </button>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5">
        {loading ? (
          <div className="p-6 text-sm text-white/60">{t.p2p.loading}</div>
        ) : trades.length ? (
          <ul className="divide-y divide-white/10">
            {trades.map((trade) => (
              <li key={trade.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="text-xs uppercase text-white/50">
                    {t.p2p.stats.order} #{trade.id}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {trade.asset} · {trade.amount} · ${trade.price}
                  </div>
                  <div className="text-xs text-white/60">
                    {t.p2p.stats.status}: {t.p2p.statuses[trade.status as keyof typeof t.p2p.statuses] || trade.status}
                  </div>
                  <div className="text-xs text-white/50">
                    {trade.buyer_username} ↔ {trade.seller_username} · {trade.payment_method_name}
                  </div>
                </div>
                <Link
                  href={`/p2p/trades/${trade.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
                >
                  {t.p2p.actions.view}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-sm text-white/60">{t.p2p.trades.empty}</div>
        )}
      </div>
    </div>
  );
}
