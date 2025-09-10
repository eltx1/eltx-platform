'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

function formatWei(wei: string, decimals: number, precision = 6): string {
  try {
    const bn = BigInt(wei);
    const base = 10n ** BigInt(decimals);
    const integer = bn / base;
    let frac = (bn % base).toString().padStart(decimals, '0');
    if (precision >= 0) frac = frac.slice(0, precision).replace(/0+$/, '');
    else frac = frac.replace(/0+$/, '');
    return frac ? `${integer}.${frac}` : integer.toString();
  } catch {
    return '0';
  }
}

type Asset = {
  symbol: string;
  display_symbol: string;
  decimals: number;
  balance_wei: string;
};

export default function PayPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [toId, setToId] = useState('');
  const [asset, setAsset] = useState('BNB');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    apiFetch<{ assets: Asset[] }>('/wallet/assets').then((res) => {
      if (res.ok) setAssets(res.data.assets);
    });
  }, []);

  const selected = assets.find((a) => a.symbol === asset);

  useEffect(() => {
    if (!selected || !amount) {
      setError('');
      return;
    }
    try {
      const amtWei = ethers.parseUnits(amount, selected.decimals);
      if (amtWei > BigInt(selected.balance_wei)) setError(t.pay.insufficient);
      else setError('');
    } catch {
      setError(t.pay.insufficient);
    }
  }, [amount, selected, t.pay.insufficient]);

  const handleSubmit = async () => {
    const res = await apiFetch('/wallet/transfer', {
      method: 'POST',
      body: JSON.stringify({ to_user_id: Number(toId), asset, amount }),
    });
    if (res.ok) {
      toast(t.pay.success);
      setToId('');
      setAmount('');
    } else {
      toast(res.error || t.common.genericError);
    }
  };

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.pay.title}</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">{t.pay.to}</label>
          <input
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="w-full p-2 rounded bg-black/20 border border-white/20"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">{t.pay.asset}</label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="w-full p-2 rounded bg-black/20 border border-white/20"
          >
            {['BNB', 'USDC', 'USDT'].map((sym) => (
              <option key={sym} value={sym}>
                {sym}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">{t.pay.amount}</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-2 rounded bg-black/20 border border-white/20"
          />
          {selected && (
            <div className="text-xs opacity-70">
              {t.pay.balance}: {formatWei(selected.balance_wei, selected.decimals)}
            </div>
          )}
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!toId || !amount || !!error}
          className="px-3 py-2 bg-gray-100 text-black rounded disabled:opacity-50 w-full"
        >
          {t.pay.send}
        </button>
      </div>
    </div>
  );
}

