'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('registered')) {
        toast(t.auth.signup.ready);
      }
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
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white/5 border border-white/10 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4"
      >
        <h1 className="text-2xl font-bold text-center mb-2">{t.auth.login.title}</h1>
        {error && (
          <div role="alert" aria-live="polite" className="text-red-500 text-sm text-center">
            {error}
          </div>
        )}
        <input
          className={`p-2 rounded bg-black/20 border ${error ? 'border-red-500' : 'border-white/20'}`}
          placeholder="Email or Username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          aria-invalid={!!error}
        />
        <input
          className={`p-2 rounded bg-black/20 border ${error ? 'border-red-500' : 'border-white/20'}`}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
        />
        <button className="btn btn-primary justify-center" type="submit" disabled={loading}>
          {loading ? `${t.auth.login.title}...` : t.auth.login.title}
        </button>
      </form>
    </main>
  );
}
