'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Search } from 'lucide-react';
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
  balance: string;
  chain_id?: number | null;
  change_24h?: string;
  change_24h_percent?: string | null;
  change_24h_wei?: string;
  last_movement_at?: string | null;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [networkFilter, setNetworkFilter] = useState<'all' | 'none' | number>('all');

  const valueFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }), []);
  const percentFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }), []);

  const getChainLabel = useCallback(
    (chainId: number | null | undefined) => {
      if (chainId === 56) return t.wallet.chainNames.bsc;
      if (chainId === 1) return t.wallet.chainNames.eth;
      if (chainId === null || chainId === undefined) return t.wallet.filters.unknown;
      return `${t.wallet.filters.network} ${chainId}`;
    },
    [t.wallet.chainNames.bsc, t.wallet.chainNames.eth, t.wallet.filters.network, t.wallet.filters.unknown]
  );

  const networkOptions = useMemo(() => {
    const map = new Map<string, { key: 'none' | number; label: string }>();
    assets.forEach((asset) => {
      const chainId = asset.chain_id ?? null;
      const key = chainId === null ? 'none' : String(chainId);
      if (!map.has(key)) {
        map.set(key, { key: chainId === null ? 'none' : chainId, label: getChainLabel(chainId) });
      }
    });
    const sorted = Array.from(map.values()).sort((a, b) => {
      const aVal = typeof a.key === 'number' ? a.key : Number.MAX_SAFE_INTEGER;
      const bVal = typeof b.key === 'number' ? b.key : Number.MAX_SAFE_INTEGER;
      return aVal - bVal;
    });
    return [{ key: 'all' as const, label: t.wallet.filters.all }, ...sorted];
  }, [assets, getChainLabel, t.wallet.filters.all]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const symbol = (asset.display_symbol || asset.symbol || '').toLowerCase();
      const matchesSearch = !normalizedSearch || symbol.includes(normalizedSearch);
      const chainId = asset.chain_id ?? null;
      const matchesNetwork =
        networkFilter === 'all'
          ? true
          : networkFilter === 'none'
          ? chainId === null
          : chainId === networkFilter;
      return matchesSearch && matchesNetwork;
    });
  }, [assets, normalizedSearch, networkFilter]);

  const groupedAssets = useMemo(() => {
    const groups = new Map<string, { label: string; chainId: number | null; items: Asset[] }>();
    filteredAssets.forEach((asset) => {
      const chainId = asset.chain_id ?? null;
      const key = chainId === null ? 'none' : String(chainId);
      if (!groups.has(key)) {
        groups.set(key, { label: getChainLabel(chainId), chainId, items: [] });
      }
      groups.get(key)!.items.push(asset);
    });
    return Array.from(groups.values()).sort((a, b) => {
      const aVal = a.chainId ?? Number.MAX_SAFE_INTEGER;
      const bVal = b.chainId ?? Number.MAX_SAFE_INTEGER;
      return aVal - bVal;
    });
  }, [filteredAssets, getChainLabel]);

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
  const eltxBalanceFormatted = eltxAsset
    ? eltxAsset.balance || formatWei(eltxAsset.balance_wei, eltxAsset.decimals)
    : '0';
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
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-semibold text-base">{t.wallet.assetsTitle}</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex flex-wrap gap-2">
              {networkOptions.map((option) => (
                <button
                  key={String(option.key)}
                  onClick={() => setNetworkFilter(option.key)}
                  className={`px-3 py-1 rounded-full text-xs transition ${
                    networkFilter === option.key
                      ? 'bg-white text-black shadow'
                      : 'bg-white/10 text-white/70 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t.wallet.searchPlaceholder}
                className="w-full rounded-full bg-white/10 border border-white/10 px-4 py-2 pr-10 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            </div>
          </div>
        </div>
        {groupedAssets.length === 0 ? (
          <div className="text-sm opacity-70">{t.wallet.noFilteredAssets}</div>
        ) : (
          <div className="space-y-4">
            {groupedAssets.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-white/60">{group.label}</div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((asset) => {
                    const changeValue = Number(asset.change_24h ?? '0');
                    const changeClass = changeValue > 0 ? 'text-green-400' : changeValue < 0 ? 'text-red-400' : 'text-white/70';
                    const formattedChange = Number.isFinite(changeValue)
                      ? `${changeValue > 0 ? '+' : changeValue < 0 ? '' : ''}${valueFormatter.format(changeValue)}`
                      : asset.change_24h ?? '0';
                    const percentValue =
                      asset.change_24h_percent !== null && asset.change_24h_percent !== undefined
                        ? Number(asset.change_24h_percent)
                        : null;
                    const formattedPercent =
                      percentValue !== null && Number.isFinite(percentValue)
                        ? `${percentValue > 0 ? '+' : percentValue < 0 ? '' : ''}${percentFormatter.format(percentValue)}%`
                        : null;
                    const lastMovement = asset.last_movement_at
                      ? new Date(asset.last_movement_at).toLocaleString()
                      : t.wallet.noMovement;
                    const balanceFormatted = asset.balance || formatWei(asset.balance_wei, asset.decimals);
                    const networkLabel = getChainLabel(asset.chain_id ?? null);
                    return (
                      <div
                        key={`${group.label}-${asset.symbol}`}
                        className={`rounded-xl border p-4 space-y-3 transition ${
                          asset.symbol === 'ELTX'
                            ? 'border-cyan-300/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                            : 'border-white/10 bg-white/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{asset.display_symbol || asset.symbol}</div>
                          <div className="text-xs uppercase tracking-wide text-white/60 text-right">{networkLabel}</div>
                        </div>
                        <div className="text-xl font-bold">{balanceFormatted}</div>
                        <div className={`text-xs ${changeClass}`}>
                          {t.wallet.change24h}: {formattedChange}
                          {formattedPercent ? ` (${formattedPercent})` : ''}
                        </div>
                        <div className="text-xs text-white/70">
                          {t.wallet.lastMovement}: {lastMovement}
                        </div>
                        {asset.contract && (
                          <button
                            className="text-xs underline decoration-dotted underline-offset-4 hover:text-white/80"
                            onClick={() => {
                              navigator.clipboard.writeText(asset.contract!);
                              toast(t.wallet.copy);
                            }}
                          >
                            {asset.contract.slice(0, 6)}…{asset.contract.slice(-4)}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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
