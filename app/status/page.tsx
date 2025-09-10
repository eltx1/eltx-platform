'use client';

import { useEffect, useState } from 'react';
import { dict, useLang } from '../lib/i18n';

type S = 'loading' | 'ok' | 'down';

export default function StatusPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const [rpcStatus, setRpcStatus] = useState<S>('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('https://bsc-dataseed.binance.org/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
        });
        const data = await res.json();
        setRpcStatus(res.ok && data.result ? 'ok' : 'down');
      } catch {
        setRpcStatus('down');
      }
    };
    check();
  }, []);

  const statusLabel = (s: S) =>
    s === 'loading'
      ? { en: 'Checking...', ar: 'جار الفحص...' }[lang]
      : s === 'ok'
      ? { en: 'Operational', ar: 'يعمل' }[lang]
      : { en: 'Down', ar: 'متوقف' }[lang];

  const services = [
    { name: { en: 'Website', ar: 'الموقع' }, status: 'ok' as S },
    { name: { en: 'BSC RPC', ar: 'واجهة BSC' }, status: rpcStatus },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.status}</h1>
      <ul className="opacity-80 text-sm space-y-2">
        {services.map((s, i) => (
          <li key={i}>
            {s.name[lang]}: {statusLabel(s.status)}
          </li>
        ))}
      </ul>
    </div>
  );
}
