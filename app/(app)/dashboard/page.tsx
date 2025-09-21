'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import {
  Wallet,
  ReceiptText,
  CreditCard,
  HelpCircle,
  Settings,
  Coins,
  ArrowLeftRight,
  CandlestickChart,
} from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
import AICard from '../../../components/dashboard/AICard';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { formatWei } from '../../lib/format';

type WalletAsset = {
  symbol: string;
  balance_wei: string;
  decimals: number;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];

  const [eltxBalance, setEltxBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    const res = await apiFetch<{ assets: WalletAsset[] }>('/wallet/assets');
    if (res.ok) {
      const asset = res.data.assets.find((a) => (a.symbol || '').toUpperCase() === 'ELTX');
      if (asset) {
        setEltxBalance(formatWei(asset.balance_wei, asset.decimals));
      } else {
        setEltxBalance(null);
      }
    } else {
      setEltxBalance(null);
    }
    setLoadingBalance(false);
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      router.replace('/login');
      return;
    }
    loadBalance();
  }, [user, router, loadBalance]);

  const balanceDisplay = useMemo(() => {
    if (eltxBalance === null) return '0';
    return eltxBalance;
  }, [eltxBalance]);

  const hasBalance = useMemo(() => {
    if (eltxBalance === null) return false;
    const numeric = Number(eltxBalance);
    return Number.isFinite(numeric) && numeric > 0;
  }, [eltxBalance]);

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.dashboard.title}</h1>
      <div className="p-4 rounded-2xl bg-white/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm opacity-80">{t.dashboard.balanceCard.title}</div>
          <div className="text-2xl font-bold">
            {loadingBalance ? t.trade.loading : balanceDisplay}
          </div>
          {!loadingBalance && !hasBalance && (
            <div className="text-xs opacity-70">{t.dashboard.balanceCard.empty}</div>
          )}
        </div>
        <a href="/wallet" className="btn btn-primary self-start sm:self-auto">
          {t.common.deposit}
        </a>
      </div>
      <AICard />
      <div className="space-y-8">
        <div>
          <h2 className="mb-4 text-sm font-semibold opacity-80">Payments</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title="Wallet" href="/wallet" icon={Wallet} />
            <SectionCard title="Transactions" href="/transactions" icon={ReceiptText} />
            <SectionCard title="Pay" href="/pay" icon={CreditCard} />
          </div>
        </div>
        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold opacity-80">Trade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title="ELTX Swap" subtitle="Convert to ELTX" href="/trade" icon={ArrowLeftRight} />
            <SectionCard title="Spot Trade" subtitle="Order book trading" href="/trade/spot" icon={CandlestickChart} />
          </div>
        </div>
        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold opacity-80">Earn</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title="Staking" href="/staking" icon={Coins} />
          </div>
        </div>
        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold opacity-80">Profile</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title="Settings" href="/settings" icon={Settings} />
            <SectionCard title="FAQ" href="/faq" icon={HelpCircle} />
          </div>
        </div>
      </div>
    </div>
  );
}

