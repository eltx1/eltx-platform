'use client';

import { useState } from 'react';
import { dict, useLang } from '../lib/i18n';

export default function AccountDeletionPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm) return;
    setStatus(null);
    try {
      const res = await fetch('/api/account-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userId, reason, message }),
      });
      if (res.ok) {
        setStatus(t.accountDeletion.success);
        setEmail('');
        setUserId('');
        setReason('');
        setMessage('');
        setConfirm(false);
      } else {
        setStatus(t.common.genericError);
      }
    } catch {
      setStatus(t.common.genericError);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.accountDeletion.title}</h1>
      <form onSubmit={submit} className="space-y-2 max-w-md">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.accountDeletion.email}
          className="w-full p-2 rounded bg-white/5"
        />
        <input
          type="text"
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t.accountDeletion.userId}
          className="w-full p-2 rounded bg-white/5"
        />
        <input
          type="text"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.accountDeletion.reason}
          className="w-full p-2 rounded bg-white/5"
        />
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.accountDeletion.message}
          className="w-full p-2 rounded bg-white/5"
        />
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            required
          />
          <span>{t.accountDeletion.confirm}</span>
        </label>
        <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded">
          {t.accountDeletion.send}
        </button>
        {status && <div className="text-sm opacity-80">{status}</div>}
      </form>
    </div>
  );
}

