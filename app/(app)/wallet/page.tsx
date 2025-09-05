'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import QRCode from 'qrcode.react';

type Deposit = {
  tx_hash: string;
  amount_wei: string;
  symbol: string;
  decimals: number;
  amount_formatted: string;
  confirmations: number;
  status: string;
  created_at: string;
};

type Asset = {
  symbol: string;
  contract: string | null;
  decimals: number;
  balance_wei: string;
  balance: string;
};

type WalletInfo = { chain_id: number; address: string };

export default function WalletPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [error, setError] = useState('');
  const [unauth, setUnauth] = useState(false);

  const load = async () => {
    const addrRes = await apiFetch<{ wallet: WalletInfo }>('/wallet/address');
    if (addrRes.error) {
      if (addrRes.error.status === 401) { setUnauth(true); return; }
      setError(t.common.genericError); return;
    }
    setWallet(addrRes.data!.wallet);
    const assetsRes = await apiFetch<{ assets: Asset[] }>('/wallet/assets');
    if (assetsRes.data) setAssets(assetsRes.data.assets);
    const txRes = await apiFetch<{ transactions: Deposit[] }>('/wallet/transactions');
    if (txRes.data) setDeposits(txRes.data.transactions);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    await apiFetch('/wallet/refresh', { method: 'POST' });
    load();
  };

  if (unauth) return <div className="p-4">Please sign in</div>;
  if (error) return <div className="p-4">{error}</div>;
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
        <button
          className="px-3 py-1 bg-gray-100 rounded text-black text-sm hover:bg-gray-200 ml-2"
          onClick={handleRefresh}
        >
          Refresh
        </button>
        <div className="p-4 flex justify-center">
          <QRCode value={wallet.address} size={160} />
        </div>
      </div>
      <div>
        <h2 className="font-semibold mb-2">Assets</h2>
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left">
              <th>Asset</th>
              <th>Balance</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} className="border-t border-white/10">
                <td className="py-1">{a.symbol}</td>
                <td className="py-1">{Number(a.balance).toFixed(6)}</td>
                <td className="py-1">
                  {a.contract && (
                    <button
                      className="underline"
                      onClick={() => {
                        navigator.clipboard.writeText(a.contract!);
                        toast('Copied');
                      }}
                    >
                      {a.contract.slice(0, 6)}…{a.contract.slice(-4)}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <div>
                {Number(d.amount_formatted).toFixed(6)} {d.symbol}
              </div>
              <div className="text-xs">{statusLabel(d.status)}</div>
            </div>
          ))}
          {deposits.length === 0 && <div className="text-sm">-</div>}
        </div>
      </div>
    </div>
  );
}
