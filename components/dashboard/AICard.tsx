'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function AICard() {
  const [q, setQ] = useState('');
  const router = useRouter();
  const goToChat = () => router.push(q ? `/ai?q=${encodeURIComponent(q)}` : '/ai');

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-indigo-500/10 to-transparent p-6 shadow-lg shadow-indigo-900/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/80">
            <Sparkles className="h-4 w-4" /> AI
          </div>
          <h2 className="text-xl font-semibold">EliteX AI Agent</h2>
          <p className="max-w-2xl text-sm text-white/70">
            اسأل عن التداول، الرصيد، أو أي فكرة في دماغك. المساعد الذكي جاهز يساعدك لحظيًا ويوفر الوقت عليك.
          </p>
        </div>
        <button
          onClick={() => router.push('/ai')}
          className="inline-flex items-center gap-2 rounded-full bg-white text-sm font-semibold text-indigo-700 px-4 py-2 shadow-md shadow-indigo-900/20 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          افتح صفحة الذكاء الاصطناعي
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-black/30 p-4 shadow-inner shadow-black/40 sm:flex-row sm:items-center">
        <div className="text-sm text-white/70">جرب تسأل حاجة سريعة</div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none"
            placeholder="مثال: ازاي اتابع رصيدي في ELTX؟"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
            onClick={goToChat}
          >
            اسأل دلوقتي
          </button>
        </div>
      </div>
    </div>
  );
}

