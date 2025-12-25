'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

type SupportStatus = 'open' | 'answered' | 'closed';

type SupportTicket = {
  id: number;
  title: string;
  status: SupportStatus;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string | null;
  message_count?: number;
  last_message_preview?: string | null;
};

type SupportMessage = {
  id: number;
  ticket_id: number;
  sender_type: 'user' | 'admin';
  admin_username?: string | null;
  user_username?: string | null;
  message: string;
  created_at?: string;
};

const statusTone: Record<SupportStatus, string> = {
  open: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  answered: 'bg-blue-500/10 text-blue-100 border-blue-400/30',
  closed: 'bg-rose-500/15 text-rose-100 border-rose-400/30',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SupportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const showError = useCallback((message: string) => toast({ message, variant: 'error' }), [toast]);
  const showSuccess = useCallback((message: string) => toast({ message, variant: 'success' }), [toast]);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [creating, setCreating] = useState(false);
  const [replying, setReplying] = useState(false);
  const [form, setForm] = useState({ title: '', message: '' });
  const [reply, setReply] = useState('');

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [router, user]);

  const statusLabel = useMemo(() => t.support.status, [t.support.status]);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    const res = await apiFetch<{ tickets: SupportTicket[] }>('/support/tickets');
    setLoadingTickets(false);
    if (!res.ok) {
      if (res.status === 401) router.replace('/login');
      else showError(res.error || t.common.genericError);
      return;
    }
    setTickets(res.data.tickets || []);
    if (!selectedTicketId && res.data.tickets?.length) {
      setSelectedTicketId(res.data.tickets[0].id);
    }
  }, [router, selectedTicketId, showError, t.common.genericError]);

  const loadThread = useCallback(
    async (ticketId: number) => {
      setLoadingThread(true);
      const res = await apiFetch<{ ticket: SupportTicket; messages: SupportMessage[] }>(
        `/support/tickets/${ticketId}`
      );
      setLoadingThread(false);
      if (!res.ok) {
        if (res.status === 401) router.replace('/login');
        else showError(res.error || t.common.genericError);
        return;
      }
      setSelectedTicketId(ticketId);
      setSelectedTicket(res.data.ticket);
      setMessages(res.data.messages || []);
      setReply('');
    },
    [router, showError, t.common.genericError]
  );

  useEffect(() => {
    if (user) loadTickets();
  }, [user, loadTickets]);

  useEffect(() => {
    if (selectedTicketId) {
      loadThread(selectedTicketId);
    }
  }, [selectedTicketId, loadThread]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showError(t.common.genericError);
      return;
    }
    setCreating(true);
    const res = await apiFetch<{ ticket: SupportTicket; messages: SupportMessage[] }>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (!res.ok) {
      showError(res.error || t.common.genericError);
      return;
    }
    showSuccess(t.support.create.success);
    setForm({ title: '', message: '' });
    await loadTickets();
    if (res.data.ticket?.id) {
      setSelectedTicketId(res.data.ticket.id);
      setSelectedTicket(res.data.ticket);
      setMessages(res.data.messages || []);
    }
  };

  const handleReply = async () => {
    if (!selectedTicketId || !reply.trim()) return;
    setReplying(true);
    const res = await apiFetch<{ ticket: SupportTicket; message: SupportMessage }>(
      `/support/tickets/${selectedTicketId}/messages`,
      { method: 'POST', body: JSON.stringify({ message: reply }) }
    );
    setReplying(false);
    if (!res.ok) {
      showError(res.error || t.common.genericError);
      return;
    }
    if (res.data.ticket) {
      setSelectedTicket(res.data.ticket);
      setTickets((prev) => prev.map((tk) => (tk.id === res.data.ticket.id ? res.data.ticket : tk)));
    }
    if (res.data.message) {
      setMessages((prev) => [...prev, res.data.message]);
    }
    setReply('');
  };

  const currentStatus: SupportStatus = selectedTicket?.status ?? 'open';
  const currentStatusLabel = statusLabel[currentStatus] || currentStatus;

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-cyan-500/10 p-5 shadow-lg shadow-indigo-900/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm uppercase text-white/60">
              <LifeBuoy className="h-4 w-4 text-indigo-300" />
              {t.support.title}
            </div>
            <h1 className="text-xl font-semibold">{t.support.subtitle}</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadTickets}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 transition hover:border-white/30 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" />
              {t.support.list.refresh}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="h-4 w-4 text-indigo-300" />
              {t.support.create.title}
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-white/60">{t.support.create.subject}</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder={t.support.create.subject}
                  maxLength={150}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-white/60">{t.support.create.message}</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                  className="h-32 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder={t.support.create.placeholder}
                  maxLength={4000}
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-blue-500 px-4 py-2 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.support.create.cta}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">{t.support.list.title}</div>
              {loadingTickets && <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />}
            </div>
            <div className="space-y-3">
              {!tickets.length && !loadingTickets && (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-3 py-6 text-center text-sm text-white/60">
                  {t.support.list.empty}
                </div>
              )}
              {tickets.map((ticket) => {
                const active = ticket.id === selectedTicketId;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-indigo-400/60 bg-indigo-500/10 shadow-lg shadow-indigo-900/30'
                        : 'border-white/10 bg-black/30 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold leading-tight">{ticket.title}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone[ticket.status]}`}>
                        {statusLabel[ticket.status]}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-white/50">
                      {t.support.list.updated}: {formatDate(ticket.last_message_at || ticket.updated_at)}
                    </div>
                    {ticket.last_message_preview && (
                      <div className="mt-2 line-clamp-2 text-sm text-white/70">{ticket.last_message_preview}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">{t.support.thread.title}</div>
                <div className="text-lg font-semibold">{selectedTicket?.title || t.support.thread.empty}</div>
              </div>
              {selectedTicket && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[currentStatus]}`}>
                    {currentStatusLabel}
                  </span>
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    {t.support.thread.metaOpened}: {formatDate(selectedTicket.created_at)}
                  </div>
                </div>
              )}
            </div>

            {!selectedTicket && (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/30 text-sm text-white/60">
                {t.support.thread.empty}
              </div>
            )}

            {selectedTicket && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <div>
                    {t.support.thread.metaUpdated}: {formatDate(selectedTicket.last_message_at || selectedTicket.updated_at)}
                  </div>
                  {loadingThread && <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />}
                </div>

                <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 max-h-[420px] overflow-y-auto">
                  {messages.map((msg) => {
                    const isUser = msg.sender_type === 'user';
                    return (
                      <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-xl rounded-2xl border px-3 py-2 text-sm shadow ${
                            isUser
                              ? 'border-indigo-400/40 bg-indigo-500/15 text-white shadow-indigo-900/30'
                              : 'border-white/10 bg-white/5 text-white'
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-white/60">
                            <span>{isUser ? t.support.badges.you : msg.admin_username || t.support.badges.admin}</span>
                            <span>{formatDate(msg.created_at)}</span>
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed text-white/90">{msg.message}</div>
                        </div>
                      </div>
                    );
                  })}
                  {!messages.length && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-sm text-white/60">
                      {t.support.thread.empty}
                    </div>
                  )}
                </div>

                {selectedTicket.status === 'closed' && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {t.support.thread.closed}
                  </div>
                )}

                {selectedTicket.status !== 'closed' && (
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-white/60">{t.support.thread.replyLabel}</label>
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        className="h-28 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                        placeholder={t.support.thread.placeholder}
                        maxLength={4000}
                      />
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">
                          {t.support.list.status}: {currentStatusLabel}
                        </div>
                        <button
                          onClick={handleReply}
                          disabled={replying || !reply.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow shadow-indigo-900/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/10"
                        >
                          {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {t.support.thread.replyCta}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
