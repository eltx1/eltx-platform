'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getConfiguredApiOriginForBrowser } from '../../../lib/api-base';
import { dict, useLang } from '../../../lib/i18n';

const CALLBACK_REDIRECT_TIMEOUT_MS = 8000;

export default function GoogleCallbackPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const [timedOut, setTimedOut] = useState(false);
  const [target, setTarget] = useState('');

  useEffect(() => {
    const base = getConfiguredApiOriginForBrowser();
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const callbackUrl = `${base}/api/auth/google/callback${search}`;
    setTarget(callbackUrl);

    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, CALLBACK_REDIRECT_TIMEOUT_MS);

    window.location.replace(callbackUrl);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="x-shell min-h-screen text-white flex items-center justify-center px-4">
      <div className="space-y-4 text-center max-w-md">
        <p className="text-sm text-white/80">{t.auth.google.completing}</p>
        {timedOut && (
          <div className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm">
            <p className="text-amber-100">{t.auth.google.callbackTimeout}</p>
            <div className="flex items-center justify-center gap-3">
              <a href={target || '/login?authError=callback_timeout'} className="rounded-lg bg-white/90 px-3 py-2 text-black hover:bg-white">
                {t.auth.google.retryCallback}
              </a>
              <Link href="/login?authError=callback_timeout" className="rounded-lg border border-white/30 px-3 py-2 hover:bg-white/10">
                {t.auth.google.backToLogin}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
