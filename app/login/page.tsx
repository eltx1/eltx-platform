'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('http://localhost:3001/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      setMessage('Logged in');
    } else {
      setMessage(data.message || 'Login failed');
    }
  };

  return (
    <main className="container py-8">
      <h1 className="text-2xl mb-4">Login</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        <input className="border p-2" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="border p-2" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <button className="bg-blue-500 text-white px-4 py-2" type="submit">Login</button>
      </form>
      {message && <p className="mt-4">{message}</p>}
    </main>
  );
}
