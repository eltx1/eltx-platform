'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, MessageCircle, Send, UserRoundPlus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { writeUnreadTotal } from '../../lib/useMessageUnread';

type MessageUser = { id: number; username: string | null };
type MessageThread = {
  id: number;
  status: 'pending' | 'accepted' | 'rejected';
  requester: MessageUser;
  recipient: MessageUser;
  counterpart: MessageUser;
  unread_count: number;
  last_message_preview?: string | null;
  last_message_at?: string | null;
};
type MessageEntry = {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_username?: string | null;
  body: string;
  created_at?: string;
};


function totalUnread(threads: MessageThread[] = []) {
  return threads.reduce((sum, thread) => sum + Number(thread.unread_count || 0), 0);
}

function wsBaseFromApiBase(apiBase?: string) {
  if (!apiBase) return 'ws://localhost:4000';
  if (apiBase.startsWith('https://')) return apiBase.replace('https://', 'wss://');
  if (apiBase.startsWith('http://')) return apiBase.replace('http://', 'ws://');
  return apiBase;
}

export default function MessagesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [inbox, setInbox] = useState<MessageThread[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [reply, setReply] = useState('');

  const selectedThread = useMemo(() => inbox.find((thread) => thread.id === selectedThreadId) || null, [inbox, selectedThreadId]);

  const loadLists = useCallback(async () => {
    setLoading(true);
    const [inboxRes, requestsRes] = await Promise.all([
      apiFetch<{ threads: MessageThread[] }>('/messages/inbox'),
      apiFetch<{ incoming: MessageThread[]; outgoing: MessageThread[] }>('/messages/requests'),
    ]);
    setLoading(false);

    if (!inboxRes.ok || !requestsRes.ok) {
      if (inboxRes.status === 401 || requestsRes.status === 401) {
        router.replace('/login');
      } else {
        toast({ message: inboxRes.error || requestsRes.error || t.common.genericError, variant: 'error' });
      }
      return;
    }

    const threads = inboxRes.data.threads || [];
    setInbox(threads);
    writeUnreadTotal(totalUnread(threads));
    setIncomingRequests(requestsRes.data.incoming || []);

    if (!selectedThreadId && inboxRes.data.threads?.length) {
      setSelectedThreadId(inboxRes.data.threads[0].id);
    }
  }, [router, selectedThreadId, t.common.genericError, toast]);

  const loadThread = useCallback(
    async (threadId: number) => {
      const res = await apiFetch<{ thread: MessageThread; messages: MessageEntry[] }>(`/messages/threads/${threadId}`);
      if (!res.ok) {
        toast({ message: res.error || t.common.genericError, variant: 'error' });
        return;
      }
      setSelectedThreadId(threadId);
      setMessages(res.data.messages || []);
      setInbox((prev) => {
        const next = prev.map((thread) => (thread.id === threadId ? { ...thread, unread_count: 0 } : thread));
        writeUnreadTotal(totalUnread(next));
        return next;
      });
    },
    [t.common.genericError, toast]
  );

  useEffect(() => {
    if (user === null) router.replace('/login');
    if (user) loadLists();
  }, [loadLists, router, user]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const composeTarget = new URLSearchParams(window.location.search).get('compose');
    if (!composeTarget) return;
    const normalized = composeTarget.startsWith('@') ? composeTarget.slice(1) : composeTarget;
    if (!normalized) return;
    setRecipientUsername(normalized);
  }, []);

  useEffect(() => {
    if (!selectedThreadId) return;
    loadThread(selectedThreadId);
  }, [loadThread, selectedThreadId]);

  useEffect(() => {
    if (!user?.id) return;
    const base = wsBaseFromApiBase(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000');
    const socket = new WebSocket(`${base}/messages/ws`);
    socket.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data || '{}');
        if (packet?.type === 'message:new') {
          const incoming = packet.payload?.message as MessageEntry | undefined;
          const threadId = Number(packet.payload?.thread_id || incoming?.thread_id || 0);
          if (!incoming || !threadId) return;
          setInbox((prev) => {
            const next = prev.map((thread) =>
              thread.id === threadId
                ? {
                    ...thread,
                    last_message_preview: incoming.body,
                    last_message_at: incoming.created_at,
                    unread_count: selectedThreadId === threadId ? 0 : (thread.unread_count || 0) + 1,
                  }
                : thread
            );
            writeUnreadTotal(totalUnread(next));
            return next;
          });
          setMessages((prev) => (selectedThreadId === threadId ? [...prev, incoming] : prev));
        }
        if (packet?.type === 'message:request' || packet?.type === 'message:request:update') {
          loadLists();
        }
      } catch {
        // ignore malformed packets
      }
    };
    return () => socket.close();
  }, [loadLists, selectedThreadId, user?.id]);

  const submitRequest = async () => {
    if (!recipientUsername.trim() || !requestMessage.trim()) return;
    setSendingRequest(true);
    const res = await apiFetch<{ thread: MessageThread }>('/messages/requests', {
      method: 'POST',
      body: JSON.stringify({ recipient_username: recipientUsername.trim(), message: requestMessage.trim() }),
    });
    setSendingRequest(false);
    if (!res.ok) {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
      return;
    }
    toast({ message: t.messages.requestSent, variant: 'success' });
    setRecipientUsername('');
    setRequestMessage('');
    await loadLists();
  };

  const respondRequest = async (threadId: number, action: 'accept' | 'reject') => {
    const res = await apiFetch<{ thread: MessageThread }>(`/messages/requests/${threadId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
      return;
    }
    toast({ message: action === 'accept' ? t.messages.requestAccepted : t.messages.requestRejected, variant: 'success' });
    await loadLists();
  };

  const sendMessage = async () => {
    if (!selectedThreadId || !reply.trim()) return;
    setSendingMessage(true);
    const res = await apiFetch<{ message: MessageEntry }>(`/messages/threads/${selectedThreadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: reply.trim() }),
    });
    setSendingMessage(false);
    if (!res.ok) {
      toast({ message: res.error || t.common.genericError, variant: 'error' });
      return;
    }
    setMessages((prev) => [...prev, res.data.message]);
    setReply('');
    setInbox((prev) => {
      const next = prev.map((thread) =>
        thread.id === selectedThreadId
          ? { ...thread, last_message_preview: res.data.message.body, last_message_at: res.data.message.created_at }
          : thread
      );
      writeUnreadTotal(totalUnread(next));
      return next;
    });
  };

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="x-card p-4">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60"><Mail className="h-4 w-4" /> {t.messages.kicker}</div>
        <h1 className="mt-2 text-lg font-semibold">{t.messages.title}</h1>
        <p className="mt-1 text-sm text-white/65">{t.messages.subtitle}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px,minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="x-card space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><UserRoundPlus className="h-4 w-4" />{t.messages.newRequest}</div>
            <input value={recipientUsername} onChange={(e) => setRecipientUsername(e.target.value)} placeholder={t.messages.usernamePlaceholder} className="x-input px-3 py-2 text-sm" />
            <textarea value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder={t.messages.requestPlaceholder} className="x-input min-h-[90px] px-3 py-2 text-sm" />
            <button onClick={submitRequest} disabled={sendingRequest} className="btn btn-primary w-full px-3 py-2 text-xs">
              {sendingRequest && <Loader2 className="h-4 w-4 animate-spin" />} {t.messages.sendRequest}
            </button>
          </div>

          <div className="x-card p-4">
            <div className="mb-2 text-sm font-semibold">{t.messages.incomingRequests} ({incomingRequests.length})</div>
            <div className="space-y-2">
              {incomingRequests.map((req) => (
                <div key={req.id} className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
                  <div className="font-semibold">@{req.requester.username || req.requester.id}</div>
                  <div className="mt-1 text-xs text-white/60 line-clamp-2">{req.last_message_preview}</div>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200" onClick={() => respondRequest(req.id, 'accept')}>{t.messages.accept}</button>
                    <button className="rounded-lg border border-rose-400/40 px-2 py-1 text-xs text-rose-200" onClick={() => respondRequest(req.id, 'reject')}>{t.messages.reject}</button>
                  </div>
                </div>
              ))}
              {!incomingRequests.length && <div className="text-xs text-white/50">{t.messages.noIncomingRequests}</div>}
            </div>
          </div>

          <div className="x-card p-4">
            <div className="mb-2 text-sm font-semibold">{t.messages.inbox} ({inbox.length})</div>
            <div className="space-y-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-white/70" />}
              {inbox.map((thread) => (
                <button key={thread.id} onClick={() => setSelectedThreadId(thread.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${selectedThreadId === thread.id ? 'border-[#c9a75c]/60 bg-[#c9a75c]/10' : 'border-white/10 bg-black/30'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">@{thread.counterpart.username || thread.counterpart.id}</span>
                    {!!thread.unread_count && <span className="rounded-full bg-[#c9a75c] px-2 py-0.5 text-[10px] font-bold text-black">{thread.unread_count}</span>}
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs text-white/60">{thread.last_message_preview || '—'}</div>
                </button>
              ))}
              {!inbox.length && !loading && <div className="text-xs text-white/50">{t.messages.emptyInbox}</div>}
            </div>
          </div>
        </aside>

        <section className="x-card flex min-h-[560px] flex-col p-4">
          {!selectedThread ? (
            <div className="m-auto text-center text-white/60">
              <MessageCircle className="mx-auto mb-2 h-8 w-8" />
              {t.messages.selectConversation}
            </div>
          ) : (
            <>
              <div className="border-b border-white/10 pb-3 text-sm font-semibold">@{selectedThread.counterpart.username || selectedThread.counterpart.id}</div>
              <div className="flex-1 space-y-2 overflow-y-auto py-3">
                {messages.map((entry) => {
                  const mine = Number(entry.sender_id) === Number(user?.id);
                  return (
                    <div key={entry.id} className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${mine ? 'ml-auto bg-[#c9a75c]/20 text-[#f8e8c3]' : 'bg-white/10 text-white'}`}>
                      <div>{entry.body}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)} className="x-input flex-1 px-3 py-2 text-sm" placeholder={t.messages.replyPlaceholder} />
                <button onClick={sendMessage} disabled={sendingMessage} className="btn btn-primary px-3 py-2 text-xs">{sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
