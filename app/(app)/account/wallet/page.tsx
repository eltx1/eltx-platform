'use client';
export const dynamic = 'force-dynamic';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { ethers } from 'ethers';
import { dict, useLang } from '../../../lib/i18n';

type Deposit = {
  tx_hash: string;
  amount_wei: string;
  confirmations: number;
  status: string;
  created_at: string;
  amount_int: string;
  chain_id?: number;
};
type WalletInfo = { chain_id: number; address: string };

export default function WalletPage() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const { lang } = useLang();
  const t = dict[lang];
  const [balance, setBalance] = useState('0');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [unauth, setUnauth] = useState(false);

  const load = useCallback(async () => {
    const addrRes = await apiFetch<{ wallet: WalletInfo; wallets?: WalletInfo[] }>('/wallet/address');
    if (!addrRes.ok) {
      if (addrRes.status === 401) { setUnauth(true); return; }
      return;
    }
    const ws = addrRes.data.wallets || (addrRes.data.wallet ? [addrRes.data.wallet] : []);
    setWallets(ws);
    const balRes = await apiFetch<{ balance_wei: string }>('/wallet/balance');
    if (balRes.ok) setBalance(balRes.data.balance_wei);
    const txRes = await apiFetch<{ transactions: Deposit[] }>('/wallet/transactions');
    if (txRes.ok) setDeposits(txRes.data.transactions);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const handleRefresh = async () => {
    await apiFetch('/wallet/refresh', { method: 'POST' });
    load();
  };

  if (unauth) return <div className="p-4">Please sign in</div>;
  if (wallets.length === 0) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <h1 className="text-xl font-semibold">Wallet</h1>
      <div className="space-y-2">
        {wallets.map(w => (
          <div key={w.chain_id} className="mb-4">
            <div>{w.chain_id === 1 ? t.wallet.chainNames.eth : t.wallet.chainNames.bsc}</div>
            <div className="text-sm break-all">{w.address}</div>
            <button className="px-3 py-1 bg-gray-100 rounded" onClick={() => navigator.clipboard.writeText(w.address)}>
              Copy
            </button>
          </div>
        ))}
        <button className="px-3 py-1 bg-gray-100 rounded" onClick={handleRefresh}>Refresh</button>
        <div className="text-sm">{Number(ethers.formatEther(balance)).toFixed(4)} BNB</div>
      </div>
      <div>
        <h2 className="font-semibold mb-2">Recent Deposits</h2>
        <div className="space-y-2">
          {deposits.map((d) => (
            <div key={d.tx_hash} className="p-3 bg-gray-100 rounded">
              <a href={`${d.chain_id === 1 ? 'https://etherscan.io/tx/' : 'https://bscscan.com/tx/'}${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline">{d.tx_hash}</a>
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
