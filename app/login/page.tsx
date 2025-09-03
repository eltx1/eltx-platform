'use client';
import { useEffect, useState } from 'react';
import Header from '../(site)/components/Header';
import { apiFetch } from '../lib/api';
import { dict, Lang } from '../(site)/i18n';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    const s = (typeof window !== 'undefined' && localStorage.getItem('lang')) as Lang | null;
    if (s) setLang(s);
  }, []);
  const t = dict[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
      }
    } finally {
      setLoading(false);
    }
  };

  return (
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
    </main>
  );
}
