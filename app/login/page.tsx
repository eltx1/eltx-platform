'use client';
import { useState } from 'react';
import Header from '../(site)/components/Header';
import { apiFetch } from '../lib/api';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = identifier.includes('@')
      ? { email: identifier, password }
      : { username: identifier, password };
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage('Logged in');
    } catch (err: any) {
      setMessage(err.message || 'Login failed');
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
          <h1 className="text-2xl font-bold text-center mb-2">Login</h1>
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
          <button className="btn btn-primary justify-center" type="submit">
            Login
          </button>
        </form>
      </div>
      {message && <p className="text-center mb-4">{message}</p>}
    </main>
  );
}
