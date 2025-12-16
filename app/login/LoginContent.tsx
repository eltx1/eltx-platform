'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { dict, useLang } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';

export default function LoginContent() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { lang, setLang } = useLang();
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
              {t.auth.login.badge}
            </div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              {t.auth.login.headline}
            </h1>
            <p className="text-white/70 text-lg max-w-2xl">{t.auth.login.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {t.auth.login.heroHighlights.map((item) => (
                <div key={item.title} className="p-4 rounded-xl border border-white/10 bg-white/5">
                  <p className="text-sm text-white/60">{item.kicker}</p>
                  <p className="text-lg font-semibold">{item.title}</p>
                  <p className="text-xs text-white/60 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-purple-500/30 bg-purple-900/20 p-4 space-y-3">
              <div className="text-sm font-semibold text-purple-100">{t.auth.login.services.title}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-white/80">
                {t.auth.login.services.items.map((item) => (
                  <div key={item.title} className="flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-white/60 text-xs">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <form
            onSubmit={handleSubmit}
            className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur w-full max-w-lg mx-auto space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-white/60">{t.auth.login.welcome}</p>
                <h2 className="text-2xl font-semibold">{t.auth.login.title}</h2>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold">
                EL
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <p className="text-white/60">{t.auth.common.languagePrompt}</p>
              <button
                type="button"
                onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/10 transition"
                aria-label={t.auth.common.languageCta}
              >
                {lang === 'en' ? 'العربية' : 'English'}
              </button>
            </div>
            {error && (
              <div role="alert" aria-live="polite" className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-white/70" htmlFor="identifier">
                {t.auth.common.emailOrUsername}
              </label>
              <input
                id="identifier"
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-purple-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                placeholder={t.auth.common.emailPlaceholder}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={!!error}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70" htmlFor="password">
                {t.auth.common.password}
              </label>
              <input
                id="password"
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-purple-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                type="password"
                placeholder={t.auth.common.passwordPlaceholder}
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
              {t.auth.login.noAccount}{' '}
              <Link className="text-purple-200 font-semibold hover:text-white" href="/signup">
                {t.auth.login.createCta}
              </Link>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/70">
              {t.auth.login.trustBadges.map((badge) => (
                <div key={badge.title} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <p className="font-semibold text-white">{badge.title}</p>
                  <p className="text-white/60">{badge.description}</p>
                </div>
              ))}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
