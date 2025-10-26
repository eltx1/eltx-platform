'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AICard() {
  const [q, setQ] = useState('');
  const router = useRouter();
  return (
    <div className="p-4 rounded-2xl bg-white/5 space-y-3">
      <div className="font-semibold">Ask ELTX AI Assistant</div>
      <div className="flex gap-2">
        <input
          className="flex-1 p-2 rounded bg-black/20 border border-white/20"
          placeholder="Ask anything..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => router.push(q ? `/ai?q=${encodeURIComponent(q)}` : '/ai')}
        >
          Ask
        </button>
      </div>
    </div>
  );
}

