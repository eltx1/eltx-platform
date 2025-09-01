'use client';
import Header from '../(site)/components/Header';
import { useState } from 'react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('http://localhost:3001/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    setMessage(data.message || (res.ok ? 'Account created' : 'Signup failed'));
  };

  return (
    <main className="container py-8">
      <Header />
      <h1 className="text-2xl mb-4">Sign Up</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        <input
          className="border p-2"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="border p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button className="bg-blue-500 text-white px-4 py-2" type="submit">
          Create Account
        </button>
      </form>
      {message && <p className="mt-4">{message}</p>}
    </main>
  );
}
