'use client';

import { useMemo, useState } from 'react';
import { dict, useLang } from '../../lib/i18n';
import { getConfiguredApiOriginForBrowser } from '../../lib/api-base';

type Props = {
  mode: 'login' | 'signup';
  className?: string;
};

const CLICK_GUARD_WINDOW_MS = 15000;

export default function GoogleAuthButton({ mode, className = '' }: Props) {
  const { lang } = useLang();
  const t = dict[lang];
  const [pending, setPending] = useState(false);

  const href = useMemo(() => {
    const base = getConfiguredApiOriginForBrowser();
    const url = new URL(`${base}/auth/google/start`, typeof window !== 'undefined' ? window.location.origin : 'https://lordai.net');
    url.searchParams.set('mode', mode);
    url.searchParams.set('redirect', '/dashboard');
    if (typeof window !== 'undefined') {
      url.searchParams.set('return_origin', window.location.origin);
    }
    return url.toString();
  }, [mode]);

  const label = mode === 'signup' ? t.auth.google.signupCta : t.auth.google.loginCta;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pending || typeof window === 'undefined') {
      event.preventDefault();
      return;
    }

    const now = Date.now();
    const raw = window.localStorage.getItem('google_oauth_click_guard_ts');
    const lastClickTs = raw ? Number(raw) : 0;
    if (lastClickTs && now - lastClickTs < CLICK_GUARD_WINDOW_MS) {
      event.preventDefault();
      window.location.assign(`/login?authError=login_in_progress`);
      return;
    }

    window.localStorage.setItem('google_oauth_click_guard_ts', String(now));
    setPending(true);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-disabled={pending}
      className={`inline-flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition hover:bg-[#f7f7f7] ${pending ? 'pointer-events-none opacity-80' : ''} ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#EA4335" d="M9 7.2v3.6h5.1c-.2 1.2-1.4 3.6-5.1 3.6a5.4 5.4 0 0 1 0-10.8c2.1 0 3.5.9 4.3 1.6l2.9-2.8A9 9 0 1 0 9 18c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1.1-.2-1.5H9Z" />
      </svg>
      <span>{pending ? t.auth.google.redirecting : label}</span>
    </a>
  );
}
