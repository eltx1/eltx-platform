'use client';
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
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      });
      toast(t.auth.signup.success);
      router.push('/login?registered=1');
    } catch (err: any) {
      if (err?.error?.code === 'USER_EXISTS') {
        toast(t.auth.signup.exists);
      } else if (err?.error?.details?.missing) {
        toast(err.error.details.missing.join(', '));
      } else {
        toast(t.auth.signup.genericError);
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
        <h1 className="text-2xl font-bold text-center mb-2">{t.auth.signup.title}</h1>
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
          {loading ? `${t.auth.signup.title}...` : t.auth.signup.title}
        </button>
      </form>
    </main>
  );
}
