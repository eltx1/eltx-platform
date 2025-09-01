'use client';
import { useState } from 'react';
import Header from '../(site)/components/Header';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    setMessage(data.message || (res.ok ? 'Logged in' : 'Login failed'));
  };

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-grow flex items-center justify-center">
        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-center mb-2">Login</h1>
          <input className="p-2 rounded bg-black/20 border border-white/20" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="p-2 rounded bg-black/20 border border-white/20" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn btn-primary justify-center" type="submit">Login</button>
        </form>
      </div>
      {message && <p className="text-center mb-4">{message}</p>}
    </main>
  );
}
