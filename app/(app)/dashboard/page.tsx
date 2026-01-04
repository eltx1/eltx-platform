'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import {
  Wallet,
  ReceiptText,
  CreditCard,
  HelpCircle,
  ShieldCheck,
  Settings,
  Coins,
  ArrowLeftRight,
  CandlestickChart,
  Gift,
  Handshake,
  LifeBuoy,
  Sparkles,
} from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
import DashboardMarketBoard from '../../../components/dashboard/DashboardMarketBoard';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';
import { formatWei } from '../../lib/format';

type WalletAsset = {
  symbol: string;
  balance_wei: string;
  decimals: number;
  balance: string;
  chain_id?: number | null;
  change_24h?: string;
  change_24h_percent?: string | null;
  change_24h_wei?: string;
  last_movement_at?: string | null;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];

  const [eltxAsset, setEltxAsset] = useState<WalletAsset | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const loadBalance = useCallback(async () => {
    setLoadingBalance(true);
    const res = await apiFetch<{ assets: WalletAsset[] }>('/wallet/assets');
    if (res.ok) {
      const asset = res.data.assets.find((a) => (a.symbol || '').toUpperCase() === 'ELTX') || null;
      setEltxAsset(asset ?? null);
    } else {
      setEltxAsset(null);
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
    if (!eltxAsset) return '0';
    if (eltxAsset.balance) return eltxAsset.balance;
    return formatWei(eltxAsset.balance_wei, eltxAsset.decimals);
  }, [eltxAsset]);

  const hasBalance = useMemo(() => {
    if (!eltxAsset) return false;
    const numeric = Number(eltxAsset.balance || '0');
    return Number.isFinite(numeric) && numeric > 0;
  }, [eltxAsset]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }), []);
  const percentFormatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }), []);

  const changeStats = useMemo(() => {
    if (!eltxAsset) return null;
    const rawValue = Number(eltxAsset.change_24h ?? '0');
    const rawPercent =
      eltxAsset.change_24h_percent !== null && eltxAsset.change_24h_percent !== undefined
        ? Number(eltxAsset.change_24h_percent)
        : null;
    const formattedValue = Number.isFinite(rawValue)
      ? `${rawValue > 0 ? '+' : rawValue < 0 ? '' : ''}${numberFormatter.format(rawValue)}`
      : eltxAsset.change_24h ?? '0';
    const formattedPercent =
      rawPercent !== null && Number.isFinite(rawPercent)
        ? `${rawPercent > 0 ? '+' : rawPercent < 0 ? '' : ''}${percentFormatter.format(rawPercent)}%`
        : null;
    const direction = rawValue > 0 ? 'up' : rawValue < 0 ? 'down' : 'flat';
    return { formattedValue, formattedPercent, direction, rawValue };
  }, [eltxAsset, numberFormatter, percentFormatter]);

  const lastMovementLabel = useMemo(() => {
    if (!eltxAsset?.last_movement_at) return t.dashboard.balanceCard.noMovement;
    try {
      return new Date(eltxAsset.last_movement_at).toLocaleString();
    } catch {
      return t.dashboard.balanceCard.noMovement;
    }
  }, [eltxAsset?.last_movement_at, t.dashboard.balanceCard.noMovement]);

  const changeColor = useMemo(() => {
    if (!changeStats) return 'text-white/70';
    if (changeStats.direction === 'up') return 'text-green-400';
    if (changeStats.direction === 'down') return 'text-red-400';
    return 'text-white/70';
  }, [changeStats]);

  return (
    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-x-hidden">
      <h1 className="text-lg font-semibold sm:text-xl">{t.dashboard.title}</h1>
      <div className="rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-3.5 py-3 sm:px-4 sm:py-4">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70 sm:text-xs">
            {t.dashboard.balanceCard.title}
          </div>
          <div className="text-xl font-bold leading-tight sm:text-3xl sm:leading-tight">
            {loadingBalance ? t.trade.loading : balanceDisplay}
          </div>
          {!loadingBalance && !hasBalance && (
            <div className="text-[11px] opacity-70">{t.dashboard.balanceCard.empty}</div>
          )}
          {eltxAsset && (
            <div className="pt-1.5 space-y-1.5 text-[11px] sm:text-xs">
              <div className={`flex flex-wrap items-center justify-between gap-2 leading-snug ${changeColor}`}>
                <span>{t.dashboard.balanceCard.change24h}</span>
                <span>
                  {changeStats ? changeStats.formattedValue : t.dashboard.balanceCard.noChange}
                  {changeStats?.formattedPercent ? ` (${changeStats.formattedPercent})` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 leading-snug text-white/70">
                <span>{t.dashboard.balanceCard.lastMovement}</span>
                <span className="text-right">{lastMovementLabel}</span>
              </div>
            </div>
          )}
        </div>
        <a href="/wallet" className="btn btn-primary self-start sm:self-auto">
          {t.common.deposit}
        </a>
      </div>
      <div className="pt-4 border-t border-white/5 sm:pt-5">
        <DashboardMarketBoard />
      </div>
    </div>
  );
}
