'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { ethers } from 'ethers';
import QRCode from 'qrcode.react';

type Deposit = {
  tx_hash: string;
  amount_wei: string;
  confirmations: number;
  status: string;
  created_at: string;
};

type WalletInfo = { chain_id: number; address: string };

export default function WalletPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    apiFetch('/wallet/me')
      .then((d) => {
        setWallet(d.wallet);
        setDeposits(d.deposits || []);
      })
      .catch((err) => {
        if (err.status === 401) router.replace('/login');
      });
  }, [router]);

  if (!wallet) return <div className="p-4">Loading...</div>;

  const statusLabel = (s: string) => {
    if (s === 'seen') return t.wallet.table.status.pending;
    if (s === 'confirmed' || s === 'swept') return t.wallet.table.status.confirmed;
    if (s === 'orphaned') return t.wallet.table.status.orphaned;
    return s;
  };

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.wallet.title}</h1>
      <div className="space-y-2">
        <div>{t.wallet.chainLabel}</div>
        <div className="text-sm break-all">{wallet.address}</div>
        <button
          className="px-3 py-1 bg-gray-100 rounded text-black text-sm hover:bg-gray-200"
          onClick={() => {
            navigator.clipboard.writeText(wallet.address);
            toast(t.wallet.copied);
          }}
        >
          {t.wallet.copy}
        </button>
        <div className="p-4 flex justify-center">
          <QRCode value={wallet.address} size={160} />
        </div>
      </div>
      <div>
        <h2 className="font-semibold mb-2">{t.wallet.transactions}</h2>
        <div className="space-y-2">
          {deposits.map((d) => (
            <div key={d.tx_hash} className="p-3 bg-white/5 rounded text-sm space-y-1">
              <div className="flex justify-between text-xs opacity-70">
                <span>{new Date(d.created_at).toLocaleString()}</span>
                <span>{d.confirmations}</span>
              </div>
              <a
                href={`https://bscscan.com/tx/${d.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline"
              >
                {d.tx_hash}
              </a>
              <div>{Number(ethers.formatEther(d.amount_wei)).toFixed(4)} BNB</div>
              <div className="text-xs">{statusLabel(d.status)}</div>
            </div>
          ))}
          {deposits.length === 0 && <div className="text-sm">-</div>}
        </div>
      </div>
    </div>
  );
}
