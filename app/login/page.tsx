'use client';
import { useEffect, useState } from 'react';
<<<<<<< HEAD
import Header from '../(site)/components/Header';
import { apiFetch } from '../lib/api';
import { dict, Lang } from '../(site)/i18n';
=======
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { dict, useLang } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
>>>>>>> codex-pr

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
<<<<<<< HEAD
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    const s = (typeof window !== 'undefined' && localStorage.getItem('lang')) as Lang | null;
    if (s) setLang(s);
  }, []);
  const t = dict[lang];
=======
  const [loading, setLoading] = useState(false);
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const router = useRouter();
  const search = useSearchParams();
  const { refresh } = useAuth();
  useEffect(() => {
    if (search.get('registered')) {
      toast(t.auth.signup.ready);
    }
  }, [search, t, toast]);
>>>>>>> codex-pr

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
<<<<<<< HEAD
    setMessage('');
    const body = identifier.includes('@') ? { email: identifier, password } : { username: identifier, password };
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(t.login);
    } catch (err: any) {
      if (err?.error?.code === 'INVALID_CREDENTIALS') {
        setMessage(t.invalid_credentials);
      } else if (err?.error?.details?.missing) {
        setMessage(t.missing_fields + err.error.details.missing.join(', '));
      } else {
        setMessage(t.request_failed);
=======
    const body = identifier.includes('@') ? { email: identifier, password } : { username: identifier, password };
    try {
      await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      toast(t.auth.login.success);
      router.push('/dashboard');
    } catch (err: any) {
      if (err?.error?.code === 'INVALID_CREDENTIALS') {
        toast(t.auth.login.invalid);
      } else if (err?.error?.details?.missing) {
        toast(err.error.details.missing.join(', '));
      } else {
        toast(t.auth.login.genericError);
>>>>>>> codex-pr
      }
    } finally {
      setLoading(false);
    }
  };

  return (
<<<<<<< HEAD
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow flex items-center justify-center">
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4"
        >
          <h1 className="text-2xl font-bold text-center mb-2">{t.login}</h1>
          <input
            className="p-2 rounded bg-black/20 border border-white/20"
            placeholder="Email or Username"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
          />
          <input
            className="p-2 rounded bg-black/20 border border-white/20"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button className="btn btn-primary justify-center" type="submit" disabled={loading}>
            {loading ? `${t.login}...` : t.login}
          </button>
        </form>
      </div>
      {message && <p className="text-center mb-4">{message}</p>}
=======
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white/5 border border-white/10 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h1 className="text-2xl font-bold text-center mb-2">{t.auth.login.title}</h1>
        <input
          className="p-2 rounded bg-black/20 border border-white/20"
          placeholder="Email or Username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <input
          className="p-2 rounded bg-black/20 border border-white/20"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn-primary justify-center" type="submit" disabled={loading}>
          {loading ? `${t.auth.login.title}...` : t.auth.login.title}
        </button>
      </form>
>>>>>>> codex-pr
    </main>
  );
}
