'use client';

import { ArrowRight, Bot, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const highlights = [
  'إجابات مدعومة بالبلوك تشين',
  'رؤية مباشرة لرصيد ELTX',
  'متابعة الكريدت اليومي',
];

export default function AICard() {
  const [q, setQ] = useState('');
  const router = useRouter();

  const quickLink = useMemo(() => (q ? `/ai?q=${encodeURIComponent(q)}` : '/ai'), [q]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-cyan-500/10 p-6 shadow-[0_25px_60px_-30px_rgba(0,0,0,0.5)]">
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-10 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-white/80">
            <Bot className="h-4 w-4 text-cyan-300" />
            EliteX AI Agent
          </div>
          <h3 className="text-xl font-semibold">اسأل ELTX AI عن تداولاتك</h3>
          <p className="text-sm text-white/80">
            مساعدك الذكي لعمليات ELTX مع متابعة رصيدك والكريدت المجاني يومياً.
          </p>
          <div className="grid grid-cols-1 gap-2 text-xs text-white/70 sm:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2"
              >
                <Sparkles className="h-4 w-4 text-cyan-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              className="w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm placeholder:text-white/50 sm:w-80"
              placeholder="اسأل أي حاجة عن ELTX..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(quickLink);
              }}
            />
            <button className="btn btn-primary inline-flex items-center gap-2" onClick={() => router.push(quickLink)}>
              افتح EliteX AI
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
