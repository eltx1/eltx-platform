'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Loader2, Send, ShieldCheck, Sparkles, UserRound, Wallet } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';

type Message = { role: 'user' | 'assistant'; content: string };
type AiUsage = {
  daily_free_messages: number;
  messages_used: number;
  paid_messages: number;
  free_remaining: number;
  eltx_spent: string;
  eltx_spent_wei: string;
  last_message_at?: string | null;
};

type AiStatus = {
  settings: { daily_free_messages: number; message_price_eltx: string };
  usage: AiUsage;
  balance: { eltx_balance: string; eltx_balance_wei: string };
  pricing: { message_price_eltx: string; message_price_wei: string };
  can_message: boolean;
  can_afford_paid: boolean;
};

type ChatResponse = {
  message: Message;
  usage: AiUsage;
  balance: AiStatus['balance'];
  pricing: AiStatus['pricing'];
  charge_type: 'free' | 'eltx';
};

const toBigIntSafe = (value: string | number | null | undefined) => {
  try {
    return BigInt(value as any);
  } catch {
    return 0n;
  }
};

function StatPill({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white/80 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-100">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
        <p className="font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function AIPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q');
  const { lang } = useLang();
  const t = dict[lang].aiChat;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSent, setInitialSent] = useState(false);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const computeCanAfford = useCallback((usage: AiUsage, pricing: AiStatus['pricing'], balance: AiStatus['balance']) => {
    const price = toBigIntSafe(pricing.message_price_wei);
    const bal = toBigIntSafe(balance.eltx_balance_wei);
    const canAffordPaid = price > 0n && bal >= price;
    return { canAffordPaid, canMessage: usage.free_remaining > 0 || canAffordPaid };
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    const res = await apiFetch<AiStatus>('/ai/status');
    if (res.ok) {
      setStatus(res.data);
    } else {
      setError(res.error || t.errors.status);
    }
    setStatusLoading(false);
  }, [t.errors.status]);

  useEffect(() => {
    if (user) refreshStatus();
  }, [user, refreshStatus]);

  const send = async (message: string) => {
    if (!message.trim()) return;
    setError(null);
    const userMessage: Message = { role: 'user', content: message };
    const optimistic = [...messages, userMessage];
    setMessages(optimistic);
    setInput('');
    setLoading(true);

    const res = await apiFetch<ChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: optimistic }),
    });

    if (res.ok && res.data?.message) {
      setMessages([...optimistic, res.data.message]);
      if (status && res.data.usage && res.data.balance && res.data.pricing) {
        const { canAffordPaid, canMessage } = computeCanAfford(res.data.usage, res.data.pricing, res.data.balance);
        setStatus({
          settings: { ...status.settings, message_price_eltx: res.data.pricing.message_price_eltx },
          usage: res.data.usage,
          balance: res.data.balance,
          pricing: res.data.pricing,
          can_afford_paid: canAffordPaid,
          can_message: canMessage,
        });
      } else {
        refreshStatus();
      }
    } else {
      setMessages((prev) => prev.slice(0, -1));
      setError(res.error || t.errors.send);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (initialQ && !initialSent && status) {
      setInitialSent(true);
      send(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, status, initialSent]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (status && !status.can_message) {
      setError(t.errors.insufficient);
      return;
    }
    send(input);
  };

  const creditLine = useMemo(() => {
    if (!status) return t.loadingBalance;
    return t.dailyUsage(status.usage.free_remaining, status.settings.daily_free_messages);
  }, [status, t]);

  const priceLine = useMemo(() => {
    if (!status) return '...';
    return t.pricedUsage(status.pricing.message_price_eltx || '0');
  }, [status, t]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-indigo-900/40 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
                <Sparkles className="h-4 w-4" /> {t.badge}
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold leading-tight">{t.title}</h1>
                <p className="text-sm text-white/70">{t.description}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-black/40 px-4 py-3 text-sm text-white/80 shadow-inner shadow-black/50">
              <span className="font-semibold text-white">{creditLine}</span>
              <span className="text-white/70">{priceLine}</span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatPill
              label={t.stats.free}
              value={status ? `${status.usage.free_remaining} / ${status.settings.daily_free_messages}` : '...'}
              icon={ShieldCheck}
            />
            <StatPill label={t.stats.price} value={status ? `${status.pricing.message_price_eltx} ELTX` : '...'} icon={Sparkles} />
            <StatPill label={t.stats.balance} value={status ? `${status.balance.eltx_balance} ELTX` : '...'} icon={Wallet} />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-6 lg:flex-row">
          <div className="flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-100">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.conversation}</p>
                  <p className="text-xs text-white/60">{t.description}</p>
                </div>
              </div>
              {statusLoading && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t.thinking}
                </span>
              )}
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4 lg:max-h-[65vh]">
              {messages.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
                  {t.empty}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse text-right' : ''}`}>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      m.role === 'user'
                        ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100'
                        : 'border-white/10 bg-white/10 text-white'
                    }`}
                  >
                    {m.role === 'user' ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={`flex max-w-[80%] flex-col gap-1 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
                      m.role === 'user'
                        ? 'border-indigo-400/40 bg-indigo-600 text-white shadow-indigo-900/40'
                        : 'border-white/10 bg-white/5 text-white/90 shadow-black/40 backdrop-blur'
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-wide text-white/60">
                      {m.role === 'user' ? 'You' : t.badge}
                    </span>
                    <span className="text-sm leading-relaxed text-white">{m.content}</span>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white/70 shadow-lg shadow-black/30">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.typing}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/5 bg-slate-900/80 px-5 py-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                  <span>{creditLine}</span>
                  <span className="h-1 w-1 rounded-full bg-white/30" />
                  <span>{priceLine}</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black/50 px-3 py-2 shadow-inner shadow-black/50">
                    <input
                      className="h-full w-full bg-transparent px-2 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={t.placeholder}
                      disabled={loading}
                    />
                  </div>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
                    disabled={loading || !input.trim() || (status !== null && !status.can_message)}
                    type="submit"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t.send}
                  </button>
                </div>
                {status && !status.can_message && <p className="text-xs text-red-200">{t.errors.insufficient}</p>}
              </form>
            </div>
          </div>

          <div className="lg:w-80 lg:flex-none">
            <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/30 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">{t.badge}</p>
                  <p className="text-lg font-semibold text-white">{t.title}</p>
                </div>
              </div>
              <div className="space-y-3">
                <StatPill
                  label={t.stats.free}
                  value={status ? `${status.usage.free_remaining} / ${status.settings.daily_free_messages}` : '...'}
                  icon={ShieldCheck}
                />
                <StatPill label={t.stats.price} value={status ? `${status.pricing.message_price_eltx} ELTX` : '...'} icon={Sparkles} />
                <StatPill label={t.stats.balance} value={status ? `${status.balance.eltx_balance} ELTX` : '...'} icon={Wallet} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense fallback={null}>
      <AIPageInner />
    </Suspense>
  );
}
