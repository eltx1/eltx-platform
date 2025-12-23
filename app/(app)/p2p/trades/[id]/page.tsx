'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { dict, useLang } from '../../../../lib/i18n';
import { useToast } from '../../../../lib/toast';

type TradeDetails = {
  id: number;
  buyer_id: number;
  seller_id: number;
  buyer_username: string;
  seller_username: string;
  payment_method_id: number;
  payment_method_name: string;
  asset: string;
  currency: string;
  price: string;
  amount: string;
  fiat_amount: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  released_at?: string | null;
  completed_at?: string | null;
  disputed_at?: string | null;
  dispute_delay_hours?: number;
  can_dispute_at?: string | null;
};

type TradeMessage = {
  id: number;
  message: string;
  sender_id: number;
  username: string;
  created_at: string;
};

export default function P2PTradeDetailPage() {
  const params = useParams();
  const tradeId = Number(params?.id);
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [trade, setTrade] = useState<TradeDetails | null>(null);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(tradeId)) return;
    setLoading(true);
    const res = await apiFetch<{ trade: TradeDetails; messages: TradeMessage[] }>(`/p2p/trades/${tradeId}`);
    if (res.ok) {
      setTrade(res.data.trade);
      setMessages(res.data.messages || []);
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
    setLoading(false);
  }, [toast, tradeId, t.common.genericError]);

  useEffect(() => {
    load();
  }, [load]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    const res = await apiFetch<{ message: TradeMessage }>(`/p2p/trades/${tradeId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      setMessages((prev) => [...prev, res.data.message]);
      setMessage('');
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  const runAction = async (path: string, successMessage: string) => {
    setActionLoading(true);
    const res = await apiFetch(path, { method: 'POST' });
    setActionLoading(false);
    if (res.ok) {
      toast({ message: successMessage, variant: 'success' });
      load();
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  const openDispute = async () => {
    const reason = window.prompt(t.p2p.dispute.prompt);
    if (!reason) return;
    setActionLoading(true);
    const res = await apiFetch(`/p2p/trades/${tradeId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setActionLoading(false);
    if (res.ok) {
      toast({ message: t.p2p.toasts.disputeOpened, variant: 'success' });
      load();
    } else {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
    }
  };

  const canMarkPaid = trade?.status === 'payment_pending';
  const canRelease = trade?.status === 'paid';
  const canComplete = trade?.status === 'released';
  const canDispute = trade && trade.status !== 'completed' && trade.status !== 'disputed';

  const disputeAvailability = useMemo(() => {
    if (!trade?.can_dispute_at) return null;
    try {
      return new Date(trade.can_dispute_at).toLocaleString();
    } catch {
      return trade.can_dispute_at;
    }
  }, [trade?.can_dispute_at]);

  if (loading) {
    return <div className="p-4 text-sm text-white/60">{t.p2p.loading}</div>;
  }

  if (!trade) {
    return <div className="p-4 text-sm text-white/60">{t.p2p.trades.empty}</div>;
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-white/60">{t.p2p.trades.order}</p>
            <h1 className="text-xl font-semibold">
              #{trade.id} · {trade.asset}
            </h1>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t.common.refresh}
          </button>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-2">
          <div>
            <div className="text-xs text-white/50">{t.p2p.stats.price}</div>
            <div className="text-lg font-semibold text-white">${trade.price}</div>
            <div className="text-xs text-white/50">/{trade.asset}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">{t.p2p.stats.amount}</div>
            <div className="text-lg font-semibold text-white">
              {trade.amount} {trade.asset}
            </div>
            <div className="text-xs text-white/50">
              {trade.fiat_amount} {trade.currency}
            </div>
          </div>
          <div>
            <div className="text-xs text-white/50">{t.p2p.stats.payment}</div>
            <div className="text-sm text-white">{trade.payment_method_name}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">{t.p2p.stats.status}</div>
            <div className="text-sm text-white">
              {t.p2p.statuses[trade.status as keyof typeof t.p2p.statuses] || trade.status}
            </div>
          </div>
          {disputeAvailability && (
            <div className="text-xs text-white/50 sm:col-span-2">
              {t.p2p.dispute.availableAt}: {disputeAvailability}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canMarkPaid && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => runAction(`/p2p/trades/${trade.id}/mark-paid`, t.p2p.toasts.markedPaid)}
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {t.p2p.actions.markPaid}
            </button>
          )}
          {canRelease && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => runAction(`/p2p/trades/${trade.id}/release`, t.p2p.toasts.released)}
              className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {t.p2p.actions.release}
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => runAction(`/p2p/trades/${trade.id}/complete`, t.p2p.toasts.completed)}
              className="rounded-full bg-blue-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {t.p2p.actions.complete}
            </button>
          )}
          {canDispute && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={openDispute}
              className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 disabled:opacity-60"
            >
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              {t.p2p.actions.dispute}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-5 w-5 text-blue-400" />
          {t.p2p.chat.title}
        </div>
        <div className="mt-4 space-y-3">
          {messages.length ? (
            messages.map((msg) => (
              <div key={msg.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <div className="text-xs text-white/50">{msg.username}</div>
                <div className="text-white">{msg.message}</div>
                <div className="text-[11px] text-white/40">{new Date(msg.created_at).toLocaleString()}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/60">{t.p2p.chat.empty}</div>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t.p2p.chat.placeholder}
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            {t.p2p.chat.send}
          </button>
        </div>
      </div>
    </div>
  );
}
