'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

type WalletInfo = { chain_id: number; address: string };

export default function DashboardPage() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  useEffect(() => {
    apiFetch('/wallet/me').then((d) => setWallet(d.wallet)).catch(() => {});
  }, []);

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {wallet && (
        <div className="text-sm break-all">{wallet.address}</div>
      )}
      <div className="flex justify-between text-sm">
        <div>Balance: --</div>
        <div>BNB Price: --</div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Link href="/account/wallet" className="p-3 bg-gray-100 rounded">Deposit</Link>
        <button disabled className="p-3 bg-gray-200 rounded text-gray-400">Withdraw</button>
        <button disabled className="p-3 bg-gray-200 rounded text-gray-400">Trade</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {['Wallet','Staking','Markets','AI','History','Security','Settings'].map((t) => (
          <div key={t} className="p-4 bg-gray-100 rounded text-center">{t}</div>
        ))}
      </div>
    </div>
  );
}
