'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { dict, useLang } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
      }
    } finally {
      setLoading(false);
    }
  };

  return (
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
    </main>
  );
}
