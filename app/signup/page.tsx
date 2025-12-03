'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { dict, useLang } from '../lib/i18n';
import { useToast } from '../lib/toast';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await apiFetch<any>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) {
      const err = (res.data as any)?.error;
      if (err?.code === 'USER_EXISTS') setError(t.auth.signup.exists);
      else if (err?.details?.missing) setError(err.details.missing.join(', '));
      else setError(res.error || t.auth.signup.genericError);
    } else {
      toast(t.auth.signup.success);
      router.push('/login?registered=1');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-black to-emerald-900 text-white flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-5xl">
        <div className="absolute inset-0 blur-3xl bg-emerald-500/20 rounded-full" aria-hidden />
        <div className="relative grid gap-10 md:grid-cols-[1fr_1.1fr] items-center">
          <section className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-sm text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              New to ELTX? Create your secure account
            </div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              {t.auth.signup.title} in a few clicks
            </h1>
            <p className="text-white/70 text-lg max-w-2xl">
              Build your portfolio with confidence. Get started with a polished, modern onboarding that keeps your data safe and your journey effortless.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                <p className="text-sm text-white/60">Fast onboarding</p>
                <p className="text-lg font-semibold">Create & verify quickly</p>
              </div>
              <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                <p className="text-sm text-white/60">Future-ready</p>
                <p className="text-lg font-semibold">Access the latest tools</p>
              </div>
            </div>
          </section>

          <form
            onSubmit={handleSubmit}
            className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur w-full max-w-lg mx-auto space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-white/60">Join the platform</p>
                <h2 className="text-2xl font-semibold">{t.auth.signup.title}</h2>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center font-bold">
                EL
              </div>
            </div>
            {error && (
              <div role="alert" aria-live="polite" className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-white/70" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-emerald-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-emerald-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                className={`p-3 rounded-xl bg-black/40 border focus:outline-none focus:ring-2 focus:ring-emerald-500/80 transition ${
                  error ? 'border-red-500' : 'border-white/20'
                }`}
                type="password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
                autoComplete="new-password"
              />
            </div>
            <button
              className="btn btn-primary justify-center w-full py-3 rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/20"
              type="submit"
              disabled={loading}
            >
              {loading ? `${t.auth.signup.title}...` : t.auth.signup.title}
            </button>
            <p className="text-sm text-center text-white/70">
              Already have an account?{' '}
              <Link className="text-emerald-200 font-semibold hover:text-white" href="/login">
                Sign in instead
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
