'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { dict, useLang } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const router = useRouter();
  const { refresh } = useAuth();
  const hasShownRegistered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || hasShownRegistered.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('registered')) {
      hasShownRegistered.current = true;
      toast(t.auth.signup.ready);
      params.delete('registered');
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [t, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const body = identifier.includes('@') ? { email: identifier, password } : { username: identifier, password };
    const res = await apiFetch<any>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const err = (res.data as any)?.error;
      if (err?.code === 'INVALID_CREDENTIALS') {
        setError(t.auth.login.invalid);
      } else if (err?.details?.missing) {
        setError(err.details.missing.join(', '));
      } else {
        setError(res.error || t.auth.login.genericError);
      }
    } else {
      await refresh();
      toast(t.auth.login.success);
      router.push('/dashboard');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-purple-950 text-white flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-5xl">
        <div className="absolute inset-0 blur-3xl bg-purple-700/20 rounded-full" aria-hidden />
        <div className="relative grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
          <section className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-sm text-purple-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Secure access to your ELTX account
            </div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              {t.auth.login.title} & stay ahead of the market
            </h1>
            <p className="text-white/70 text-lg max-w-2xl">
              Welcome back. Sign in to manage your assets, track performance, and explore the latest opportunities in a sleek, modern experience.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                <p className="text-sm text-white/60">Realtime insights</p>
                <p className="text-lg font-semibold">Dynamic dashboards</p>
              </div>
              <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                <p className="text-sm text-white/60">Multi-layer security</p>
                <p className="text-lg font-semibold">Protected sign-in</p>
              </div>
            </div>
          </section>

          <form
            onSubmit={handleSubmit}
            className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur w-full max-w-lg mx-auto space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-white/60">Welcome back</p>
                <h2 className="text-2xl font-semibold">{t.auth.login.title}</h2>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold">
                EL
              </div>
            </div>
            {error && (
              <div role="alert" aria-live="polite" className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-white/70" htmlFor="identifier">
                Email or Username
              </label>
              <input
                id="identifier"
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-purple-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                placeholder="you@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={!!error}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-purple-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
                autoComplete="current-password"
              />
            </div>
            <button
              className="btn btn-primary justify-center w-full py-3 rounded-xl text-base font-semibold shadow-lg shadow-purple-500/20"
              type="submit"
              disabled={loading}
            >
              {loading ? `${t.auth.login.title}...` : t.auth.login.title}
            </button>
            <p className="text-sm text-center text-white/70">
              Don&apos;t have an account?{' '}
              <Link className="text-purple-200 font-semibold hover:text-white" href="/signup">
                Create yours
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
