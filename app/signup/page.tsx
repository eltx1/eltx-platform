'use client';
import { useEffect, useState } from 'react';
import Header from '../(site)/components/Header';
import { apiFetch } from '../lib/api';
import { dict, Lang } from '../(site)/i18n';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
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
    try {
      await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      });
      setMessage(t.signup);
    } catch (err: any) {
      if (err?.error?.code === 'USER_EXISTS') {
        setMessage(t.user_exists);
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
          <h1 className="text-2xl font-bold text-center mb-2">{t.signup}</h1>
          <input
            className="p-2 rounded bg-black/20 border border-white/20"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="p-2 rounded bg-black/20 border border-white/20"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <input
            className="p-2 rounded bg-black/20 border border-white/20"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button className="btn btn-primary justify-center" type="submit" disabled={loading}>
            {loading ? `${t.signup}...` : t.signup}
          </button>
        </form>
      </div>
      {message && <p className="text-center mb-4">{message}</p>}
    </main>
  );
}
