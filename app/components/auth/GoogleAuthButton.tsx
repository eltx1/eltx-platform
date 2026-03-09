'use client';

import { useMemo } from 'react';
import { dict, useLang } from '../../lib/i18n';

type Props = {
  mode: 'login' | 'signup';
  className?: string;
};

function getApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_BASE || '';
  return raw.replace(/\/+$/, '');
}

export default function GoogleAuthButton({ mode, className = '' }: Props) {
  const { lang } = useLang();
  const t = dict[lang];

  const href = useMemo(() => {
    const base = getApiBase();
    const url = new URL(`${base}/auth/google/start`, typeof window !== 'undefined' ? window.location.origin : 'https://lordai.net');
    url.searchParams.set('mode', mode);
    url.searchParams.set('redirect', '/dashboard');
    if (typeof window !== 'undefined') {
      url.searchParams.set('return_origin', window.location.origin);
    }
    return url.toString();
  }, [mode]);

  const label = mode === 'signup' ? t.auth.google.signupCta : t.auth.google.loginCta;

  return (
    <a
      href={href}
      className={`inline-flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition hover:bg-[#f7f7f7] ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#EA4335" d="M9 7.2v3.6h5.1c-.2 1.2-1.4 3.6-5.1 3.6a5.4 5.4 0 0 1 0-10.8c2.1 0 3.5.9 4.3 1.6l2.9-2.8A9 9 0 1 0 9 18c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1.1-.2-1.5H9Z" />
      </svg>
      <span>{label}</span>
    </a>
  );
}
