'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const apiBase = process.env.NEXT_PUBLIC_API_URL;
if (!apiBase) throw new Error('NEXT_PUBLIC_API_URL is not defined');

type Deposit = { tx_hash: string; amount_wei: string; confirmations: number; status: string; created_at: string };
type WalletInfo = { chain: string; address: string; derivation_index: number };

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/wallet/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setWallet(d.wallet);
        setDeposits(d.deposits || []);
      });
  }, []);

  if (!wallet) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <h1 className="text-xl font-semibold">Wallet</h1>
      <div className="space-y-2">
        <div className="text-sm break-all">{wallet.address}</div>
        <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => navigator.clipboard.writeText(wallet.address)}>Copy</button>
        <div className="p-4">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${wallet.address}`} alt="qr" className="mx-auto" />
        </div>
      </div>
      <div>
        <h2 className="font-semibold mb-2">Recent Deposits</h2>
        <div className="space-y-2">
          {deposits.map((d) => (
            <div key={d.tx_hash} className="p-3 bg-gray-100 rounded">
              <a href={`https://bscscan.com/tx/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline">{d.tx_hash}</a>
              <div className="text-xs">{d.amount_wei} wei</div>
              <div className="text-xs">{d.confirmations} conf — {d.status}</div>
              <div className="text-xs">{new Date(d.created_at).toLocaleString()}</div>
            </div>
          ))}
          {deposits.length === 0 && <div className="text-sm">No deposits</div>}
        </div>
      </div>
    </div>
  );
}
