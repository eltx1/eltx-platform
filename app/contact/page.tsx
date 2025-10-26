'use client';

import { useState } from 'react';
import { dict, useLang } from '../lib/i18n';

export default function ContactPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message }),
      });
      if (res.ok) {
        setStatus(t.contact.success);
        setEmail('');
        setMessage('');
      } else {
        setStatus(t.common.genericError);
      }
    } catch {
      setStatus(t.common.genericError);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.contact}</h1>
      <form onSubmit={submit} className="space-y-2 max-w-md">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.contact.email}
          className="w-full p-2 rounded bg-white/5"
        />
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.contact.message}
          className="w-full p-2 rounded bg-white/5"
        />
        <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded">
          {t.contact.send}
        </button>
        {status && <div className="text-sm opacity-80">{status}</div>}
      </form>
    </div>
  );
}
