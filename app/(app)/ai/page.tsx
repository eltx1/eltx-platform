'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

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
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 shadow-inner shadow-black/30">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
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
      setError(res.error || 'تعذر تحميل حالة رصيد الذكاء الاصطناعي');
    }
    setStatusLoading(false);
  }, []);

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
      setError(res.error || 'حصلت مشكلة أثناء إرسال الرسالة');
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
      setError('رصيد الرسائل أو عملة ELTX غير كافي لإرسال رسالة جديدة');
      return;
    }
    send(input);
  };

  const creditLine = useMemo(() => {
    if (!status) return 'جاري حساب الرصيد...';
    return `متبقي مجاني اليوم: ${status.usage.free_remaining}/${status.settings.daily_free_messages}`;
  }, [status]);

  const priceLine = useMemo(() => {
    if (!status) return '...';
    return `تكلفة الرسالة بعد نفاد المجاني: ${status.pricing.message_price_eltx || '0'} ELTX`;
  }, [status]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-indigo-900/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
                <Sparkles className="h-4 w-4" /> EliteX AI Agent
              </div>
              <h1 className="text-2xl font-semibold">دردش مع الذكاء الاصطناعي</h1>
              <p className="text-sm text-white/70">رصيدك المجاني يتحدث أولاً، وبعدها يتم الخصم من عملة ELTX تلقائيًا.</p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <span>{creditLine}</span>
              <span>{priceLine}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatPill label="الرصيد المجاني" value={status ? `${status.usage.free_remaining} / ${status.settings.daily_free_messages}` : '...'} icon={ShieldCheck} />
            <StatPill label="سعر الرسالة" value={status ? `${status.pricing.message_price_eltx} ELTX` : '...'} icon={Sparkles} />
            <StatPill label="رصيد ELTX" value={status ? `${status.balance.eltx_balance} ELTX` : '...'} icon={Wallet} />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex-1 space-y-3 rounded-3xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-black/50">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>المحادثة</span>
              {statusLoading && (
                <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  تحديث الرصيد
                </span>
              )}
            </div>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-2xl bg-white/5 p-4">
              {messages.length === 0 && (
                <div className="text-center text-sm text-white/60">ابدأ برسالة، واحنا هنرد عليك فورًا.</div>
              )}
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-lg ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white shadow-indigo-900/40'
                        : 'bg-white/10 text-white/90 shadow-black/40'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري التفكير...
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-indigo-900/10">
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <span>{creditLine}</span>
              <span className="h-1 w-1 rounded-full bg-white/30" />
              <span>{priceLine}</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:border-indigo-300 focus:outline-none"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب سؤالك..."
                disabled={loading}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
                disabled={loading || !input.trim() || (status !== null && !status.can_message)}
                type="submit"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ابعت
              </button>
            </div>
            {status && !status.can_message && (
              <p className="text-xs text-red-200">رصيدك المجاني خلص ومفيش ELTX كفاية، زوّد رصيدك علشان تكمل محادثة.</p>
            )}
          </form>
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
