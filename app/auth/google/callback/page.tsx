'use client';

import { useEffect } from 'react';

import { getApiBaseForBrowser } from '../../../lib/api-base';

export default function GoogleCallbackPage() {
  useEffect(() => {
    const base = getApiBaseForBrowser();
    const search = typeof window !== 'undefined' ? window.location.search : '';
    window.location.replace(`${base}/auth/google/callback${search}`);
  }, []);

  return (
    <main className="x-shell min-h-screen text-white flex items-center justify-center px-4">
      <p className="text-sm text-white/80">Completing Google sign-in…</p>
    </main>
  );
}
