'use client';

import { useEffect } from 'react';

function getApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_BASE || '';
  return raw.replace(/\/+$/, '');
}

export default function GoogleCallbackPage() {
  useEffect(() => {
    const base = getApiBase();
    const search = typeof window !== 'undefined' ? window.location.search : '';
    window.location.replace(`${base}/auth/google/callback${search}`);
  }, []);

  return (
    <main className="x-shell min-h-screen text-white flex items-center justify-center px-4">
      <p className="text-sm text-white/80">Completing Google sign-in…</p>
    </main>
  );
}
