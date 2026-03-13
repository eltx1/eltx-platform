'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '../../app/lib/auth';
import GoogleAuthButton from '../../app/components/auth/GoogleAuthButton';
import { apiFetch } from '../../app/lib/api';
import { LogIn, Sparkles, UserPlus } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

export default function Hero() {
  const { user, refresh } = useAuth();
  const { lang, setLang } = useLang();
  const router = useRouter();
  const t = dict[lang];
  const hero = t.home.hero;
  const [authTab, setAuthTab] = useState<'signup' | 'login'>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ email: '', password: '' });

  const activeForm = useMemo(() => (authTab === 'signup' ? signupForm : loginForm), [authTab, loginForm, signupForm]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const path = authTab === 'signup' ? '/auth/signup' : '/auth/login';
    const res = await apiFetch<any>(path, {
      method: 'POST',
      body: JSON.stringify(activeForm),
    });

    if (!res.ok) {
      const err = (res.data as any)?.error;
      if (err?.code === 'INVALID_CREDENTIALS') {
        setError(t.auth.login.invalid);
      } else if (err?.details?.missing) {
        setError(err.details.missing.join(', '));
      } else {
        setError(res.error || t.auth.login.genericError);
      }
      setLoading(false);
      return;
    }

    const refreshedUser = await refresh();

    if (authTab === 'signup') {
      setAuthTab('login');
    }

    if (refreshedUser) {
      router.push('/dashboard');
    } else if (authTab === 'login') {
      setError(t.auth.login.genericError);
    }

    setLoading(false);
  };

  return (
    <section className="relative overflow-hidden border-b border-[#2f3336] py-14 text-white md:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_12%,rgba(29,155,240,0.22),transparent_32%),radial-gradient(circle_at_86%_14%,rgba(123,97,255,0.18),transparent_30%)]" />
      <div className="relative z-10 mx-auto grid max-w-6xl items-start gap-8 px-4 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-3"
        >
          <h1 className="max-w-3xl text-sm font-medium text-white/90 md:text-base">{hero.statement}</h1>
          {!user && (
            <p className="text-xs text-white/70 md:text-sm">
              {hero.inlineCta}{' '}
              <Link href="/signup" className="font-semibold text-[#c9a75c] hover:text-[#e2c784]">
                {t.nav.signup}
              </Link>
            </p>
          )}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="x-card space-y-4 p-5"
        >
          <h2 className="text-xl font-semibold">{hero.cardTitle}</h2>
          <p className="text-sm text-white/75">{hero.cardSubtitle}</p>

          {user ? (
            <div className="space-y-3">
              <Link href="/dashboard" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a75c] px-6 py-3 text-sm font-semibold hover:brightness-110">
                <UserPlus className="h-4 w-4" />
                <span>{hero.goDashboard}</span>
                <Sparkles className="h-4 w-4" />
              </Link>
              <Link href="/dashboard" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-6 py-3 text-sm font-semibold hover:bg-[#1d1f23]">
                <LogIn className="h-4 w-4" />
                <span>{hero.returnAccount}</span>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="inline-flex rounded-full border border-[#2f3336] bg-[#0f1113] p-1">
                  <button
                    type="button"
                    onClick={() => setAuthTab('signup')}
                    className={`rounded-full px-4 py-1.5 font-semibold transition ${authTab === 'signup' ? 'bg-[#c9a75c] text-black' : 'text-white/75 hover:text-white'}`}
                  >
                    {t.auth.signup.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthTab('login')}
                    className={`rounded-full px-4 py-1.5 font-semibold transition ${authTab === 'login' ? 'bg-[#c9a75c] text-black' : 'text-white/75 hover:text-white'}`}
                  >
                    {t.auth.login.title}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                  className="rounded-full border border-[#2f3336] px-3 py-1 text-white/80 hover:bg-white/10"
                  aria-label={t.auth.common.languageCta}
                >
                  {lang === 'en' ? 'العربية' : 'English'}
                </button>
              </div>

              <form onSubmit={onSubmit} className="space-y-3">

              <GoogleAuthButton mode={authTab === 'signup' ? 'signup' : 'login'} />
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/20" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/60">{t.auth.google.or}</span>
                <div className="h-px flex-1 bg-white/20" />
              </div>

                {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
                <div className="space-y-1">
                  <label className="text-xs text-white/70">{t.auth.common.email}</label>
                  <input
                    value={activeForm.email}
                    onChange={(e) =>
                      authTab === 'signup'
                        ? setSignupForm((prev) => ({ ...prev, email: e.target.value }))
                        : setLoginForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    autoComplete="email"
                    placeholder={t.auth.common.emailPlaceholder}
                    className="w-full rounded-xl border border-[#2f3336] bg-[#0f1113] px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none focus:ring-2 focus:ring-[#c9a75c]/70"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/70">{t.auth.common.password}</label>
                  <input
                    type="password"
                    value={activeForm.password}
                    onChange={(e) =>
                      authTab === 'signup'
                        ? setSignupForm((prev) => ({ ...prev, password: e.target.value }))
                        : setLoginForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    autoComplete={authTab === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={authTab === 'signup' ? t.auth.signup.passwordPlaceholder : t.auth.common.passwordPlaceholder}
                    className="w-full rounded-xl border border-[#2f3336] bg-[#0f1113] px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none focus:ring-2 focus:ring-[#c9a75c]/70"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a75c] px-6 py-3 text-sm font-semibold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {authTab === 'signup' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  <span>
                    {loading
                      ? authTab === 'signup'
                        ? `${t.auth.signup.title}...`
                        : `${t.auth.login.title}...`
                      : authTab === 'signup'
                        ? hero.createAccount
                        : hero.signIn}
                  </span>
                </button>
              </form>
            </>
          )}

        </motion.aside>
      </div>
    </section>
  );
}
