'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { formatWei } from '../../lib/format';

type Transaction = {
  tx_hash: string | null;
  token_address?: string;
  amount_wei: string;
  display_symbol: string;
  decimals: number;
  amount_formatted: string;
  amount_int: string;
  confirmations: number;
  status: string;
  created_at: string;
  type: 'deposit' | 'transfer';
  direction?: 'in' | 'out';
  counterparty?: number;
  chain_id?: number;
};

type Asset = {
  symbol: string;
  display_symbol: string;
  contract: string | null;
  decimals: number;
  balance_wei: string;
};

type WalletInfo = { chain_id: number; address: string };

export default function WalletPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  const [unauth, setUnauth] = useState(false);

  const load = useCallback(async () => {
    const addrRes = await apiFetch<{ wallet: WalletInfo; wallets?: WalletInfo[] }>('/wallet/address');
    if (!addrRes.ok) {
      if (addrRes.status === 401) { setUnauth(true); return; }
      setError(addrRes.error || t.common.genericError); return;
    }
    const ws = addrRes.data.wallets || (addrRes.data.wallet ? [addrRes.data.wallet] : []);
    setWallets(ws);
    const assetsRes = await apiFetch<{ assets: Asset[] }>('/wallet/assets');
    if (assetsRes.ok) setAssets(assetsRes.data.assets);
    const txRes = await apiFetch<{ transactions: Transaction[] }>('/wallet/transactions');
    if (txRes.ok) setTransactions(txRes.data.transactions);
  }, [t]);

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
  if (error) return <div className="p-4">{error}</div>;
  if (wallets.length === 0) return <div className="p-4">Loading...</div>;

  const eltxAsset = assets.find((a) => (a.symbol || '').toUpperCase() === 'ELTX');
  const eltxBalanceFormatted = eltxAsset ? formatWei(eltxAsset.balance_wei, eltxAsset.decimals) : '0';
  const hasEltxBalance = eltxAsset ? Number(eltxBalanceFormatted) > 0 : false;

  const statusLabel = (s: string) => {
    if (s === 'seen') return t.wallet.table.status.pending;
    if (s === 'confirmed' || s === 'swept') return t.wallet.table.status.confirmed;
    if (s === 'orphaned') return t.wallet.table.status.orphaned;
     if (s === 'sent') return t.wallet.transfer.sent;
     if (s === 'received') return t.wallet.transfer.received;
    return s;
  };

  return (
    <div className="p-4 space-y-6 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.wallet.title}</h1>
      {hasEltxBalance && (
        <div className="p-4 rounded-2xl bg-white/5">
          <div className="text-sm opacity-80">{t.dashboard.balanceCard.title}</div>
          <div className="text-2xl font-bold">{eltxBalanceFormatted}</div>
        </div>
      )}
      {user && (
        <div className="space-y-1">
          <div className="text-sm opacity-80">{t.common.userId}</div>
          <div className="p-3 bg-white/5 rounded flex items-center justify-between">
            <span className="text-sm">{user.id}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(String(user.id));
                toast(t.common.copied);
              }}
              className="p-1 hover:text-white/80"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {wallets.map((w) => (
          <div key={w.chain_id} className="mb-4">
            <div>{w.chain_id === 1 ? t.wallet.chainNames.eth : t.wallet.chainNames.bsc}</div>
            <div className="text-sm break-all">{w.address}</div>
            <button
              className="px-3 py-1 bg-gray-100 rounded text-black text-sm hover:bg-gray-200"
              onClick={() => {
                navigator.clipboard.writeText(w.address);
                toast(t.wallet.copied);
              }}
            >
              {t.wallet.copy}
            </button>
          </div>
        ))}
        <button
          className="px-3 py-1 bg-gray-100 rounded text-black text-sm hover:bg-gray-200"
          onClick={handleRefresh}
        >
          Refresh
        </button>
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
              <tr
                key={a.symbol}
                className={`border-t border-white/10 ${a.symbol === 'ELTX' ? 'bg-white/5' : ''}`}
              >
                <td className={`py-1 ${a.symbol === 'ELTX' ? 'font-semibold' : ''}`}>
                  {a.display_symbol || a.symbol}
                </td>
                <td className="py-1">{formatWei(a.balance_wei, a.decimals)}</td>
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
          {transactions.map((d) => (
            <div key={(d.tx_hash || '') + d.created_at} className="p-3 bg-white/5 rounded text-sm space-y-1">
              <div className="flex justify-between text-xs opacity-70">
                <span>{new Date(d.created_at).toLocaleString()}</span>
                <span>{d.confirmations}</span>
              </div>
              {d.tx_hash ? (
                <a
                  href={`${d.chain_id === 1 ? 'https://etherscan.io/tx/' : 'https://bscscan.com/tx/'}${d.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all underline"
                >
                  {d.tx_hash}
                </a>
              ) : (
                <div>
                  {d.direction === 'out'
                    ? `${t.wallet.transfer.to} ${d.counterparty}`
                    : `${t.wallet.transfer.from} ${d.counterparty}`}
                </div>
              )}
              <div>
                {(d.direction === 'out' ? '-' : '') + Number(d.amount_formatted).toFixed(6)} {d.display_symbol}
              </div>
              <div className="text-xs">{statusLabel(d.status)}</div>
            </div>
          ))}
          {transactions.length === 0 && <div className="text-sm">-</div>}
        </div>
      </div>
    </div>
  );
}
