'use client';

export const dynamic = 'force-dynamic';

import type { ComponentType } from 'react';
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coins, ShieldCheck, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

type Message = { role: 'user' | 'assistant'; content: string };
type WalletAsset = { symbol: string; balance?: string; balance_wei?: string; decimals?: number };
type AiUsage = {
  daily_free_quota: number;
  daily_free_remaining: number;
  price_per_message_eltx: number;
  last_reset_at?: string | null;
};

const FALLBACK_USAGE: AiUsage = {
  daily_free_quota: 10,
  daily_free_remaining: 10,
  price_per_message_eltx: 0.5,
  last_reset_at: null,
};

function StatPill({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<any> }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80">
      <span className="rounded-full bg-white/10 p-2 text-cyan-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-white/60">{label}</span>
        <span className="text-sm font-semibold text-white">{value}</span>
      </div>
    </div>
  );
}

function formatNumber(num: number | null | undefined, maximumFractionDigits = 2) {
  const numeric = num !== null && num !== undefined ? Number(num) : NaN;
  if (!Number.isFinite(numeric)) return '--';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(numeric);
}

function AIPageInner() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [sessionPaidSpent, setSessionPaidSpent] = useState(0);

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    const res = await apiFetch<AiUsage>('/ai/usage');
    if (res.ok) {
      const quota = Number(res.data.daily_free_quota);
      const remaining = Number(res.data.daily_free_remaining);
      const price = Number(res.data.price_per_message_eltx);
      setUsage({
        daily_free_quota: Number.isFinite(quota) && quota >= 0 ? quota : FALLBACK_USAGE.daily_free_quota,
        daily_free_remaining: Number.isFinite(remaining) && remaining >= 0 ? remaining : FALLBACK_USAGE.daily_free_remaining,
        price_per_message_eltx: Number.isFinite(price) && price >= 0 ? price : FALLBACK_USAGE.price_per_message_eltx,
        last_reset_at: res.data.last_reset_at ?? null,
      });
    } else {
      setUsage(FALLBACK_USAGE);
    }
    setLoadingUsage(false);
  }, []);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    const res = await apiFetch<{ assets: WalletAsset[] }>('/wallet/assets');
    if (res.ok) {
      const asset = res.data.assets.find((a) => (a.symbol || '').toUpperCase() === 'ELTX');
      if (asset) {
        const numericBalance = (() => {
          if (asset.balance !== undefined) {
            const parsed = Number(asset.balance);
            if (Number.isFinite(parsed)) return parsed;
          }
          const raw = Number(asset.balance_wei ?? '0');
          const decimals = Number(asset.decimals ?? 18);
          if (Number.isFinite(raw) && Number.isFinite(decimals)) return raw / 10 ** decimals;
          return null;
        })();
        setBalance(numericBalance ?? 0);
      } else {
        setBalance(0);
      }
    } else {
      setBalance(null);
    }
    setLoadingBalance(false);
  }, []);

  useEffect(() => {
    loadUsage();
    loadBalance();
  }, [loadUsage, loadBalance]);

  async function send(message: string) {
    const userMessage: Message = { role: 'user', content: message };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.message) {
        const usageSnapshot = usage ?? FALLBACK_USAGE;
        setMessages([...newMessages, data.message]);
        setUsage((prev) => {
          const current = prev ?? usageSnapshot;
          if (current.daily_free_remaining > 0) {
            return { ...current, daily_free_remaining: Math.max(current.daily_free_remaining - 1, 0) };
          }
          return current;
        });
        setSessionPaidSpent((prev) => {
          const current = usage ?? usageSnapshot;
          if (current.daily_free_remaining > 0) return prev;
          return prev + (current.price_per_message_eltx ?? FALLBACK_USAGE.price_per_message_eltx);
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQ) send(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    send(input);
  };

  const freeQuota = usage?.daily_free_quota ?? FALLBACK_USAGE.daily_free_quota;
  const freeRemaining = usage?.daily_free_remaining ?? FALLBACK_USAGE.daily_free_remaining;
  const pricePerMessage = usage?.price_per_message_eltx ?? FALLBACK_USAGE.price_per_message_eltx;
  const freeUsed = Math.max(0, freeQuota - freeRemaining);
  const freeProgress = freeQuota === 0 ? 100 : Math.min(100, (freeUsed / freeQuota) * 100);
  const effectiveBalance = useMemo(() => {
    if (balance === null) return null;
    return Math.max(balance - sessionPaidSpent, 0);
  }, [balance, sessionPaidSpent]);

  return (
    <div className="relative space-y-6 p-4">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-indigo-700/40 via-purple-700/30 to-cyan-600/30 p-6 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
              <Sparkles className="h-4 w-4 text-cyan-200" />
              EliteX AI Agent
            </div>
            <h1 className="text-2xl font-semibold">محادثة أذكى مع دعم رصيد ELTX والكريدت اليومي</h1>
            <p className="text-sm text-white/80">
              استهلك الكريدت المجاني اليومي أولاً، وبعدها يتم خصم تكلفة كل رسالة من رصيد ELTX الخاص بك بشكل واضح.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[380px]">
            <StatPill
              label="الكريدت المجاني اليومي"
              value={loadingUsage ? '...loading' : `${freeRemaining} / ${freeQuota}`}
              icon={Sparkles}
            />
            <StatPill
              label="تكلفة الرسالة بعد المجاني"
              value={`${formatNumber(pricePerMessage, 4)} ELTX`}
              icon={ShieldCheck}
            />
            <StatPill
              label="رصيدك من ELTX"
              value={loadingBalance ? '...loading' : `${formatNumber(effectiveBalance ?? balance, 6)} ELTX`}
              icon={Coins}
            />
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400/70 transition-all"
            style={{ width: `${freeProgress}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-white/70">
          {freeRemaining > 0
            ? `متبقي ${freeRemaining} رسالة مجانية اليوم قبل الخصم من ELTX.`
            : `تم استهلاك المجاني. كل رسالة ستكلف ${formatNumber(pricePerMessage, 4)} ELTX.`}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-sm text-white/70">
            <span>EliteX AI Session</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">Live</span>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/70">
                ابدأ الحديث مع المساعد عن تداولاتك أو أي استفسار متعلق بـ ELTX.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm shadow-md shadow-black/40 ${m.role === 'user' ? 'bg-gradient-to-r from-cyan-500/80 to-indigo-500/80 text-white' : 'bg-white/10 text-white'}`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/70">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                  المساعد بيكتب...
                </div>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <input
                className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب رسالتك للمساعد..."
              />
              <button
                className="btn btn-primary px-4"
                disabled={loading || !input.trim()}
                type="submit"
              >
                أرسل
              </button>
            </div>
            <div className="mt-2 text-[11px] text-white/60">
              {freeRemaining > 0
                ? `هيتم استخدام الكريدت المجاني أولاً (${freeRemaining} متبقي).`
                : `سيتم خصم ${formatNumber(pricePerMessage, 4)} ELTX لكل رسالة من رصيدك.`}
            </div>
          </form>
        </div>

        <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">تفاصيل الكريدت والخصم</h3>
          <div className="space-y-3 text-sm text-white/80">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-white/60">الكريدت اليومي</div>
              <p className="text-sm">{`متاح لك ${freeQuota} رسالة مجانية كل يوم.`}</p>
              <p className="text-xs text-white/60">يتم إعادة التعيين تلقائياً {usage?.last_reset_at ? `في ${usage.last_reset_at}` : 'عند منتصف الليل حسب إعدادات السيرفر'}.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-white/60">الخصم من رصيد ELTX</div>
              <p className="text-sm">{`بعد نفاد الكريدت المجاني، يتم خصم ${formatNumber(pricePerMessage, 4)} ELTX لكل رسالة.`}</p>
              <p className="text-xs text-white/60">سعر الرسالة قابل للتحديث من لوحة الإدارة وسيظهر هنا فوراً.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-white/60">المتابعة اللحظية</div>
              <p className="text-sm">شاهد رصيدك وتقدم استخدامك مباشرة أثناء المحادثة.</p>
            </div>
          </div>
        </aside>
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
