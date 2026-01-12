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
      <div className="rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70 sm:text-[11px]">
            {t.dashboard.balanceCard.title}
          </div>
          <div className="text-lg font-bold leading-tight sm:text-2xl sm:leading-tight">
            {loadingBalance ? t.trade.loading : balanceDisplay}
          </div>
          {!loadingBalance && !hasBalance && (
            <div className="text-[10px] opacity-70 sm:text-[11px]">{t.dashboard.balanceCard.empty}</div>
          )}
          {eltxAsset && (
            <div className="pt-1 space-y-1 text-[10px] sm:text-[11px]">
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
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <a href="/wallet" className="btn btn-primary px-3 py-1.5 text-[11px] sm:text-xs">
            {t.common.deposit}
          </a>
          <a href="/pay" className="btn btn-primary px-3 py-1.5 text-[11px] sm:text-xs">
            {t.common.send}
          </a>
          <a href="/trade/spot" className="btn btn-primary px-3 py-1.5 text-[11px] sm:text-xs">
            {t.common.trade}
          </a>
        </div>
      </div>
      <div className="space-y-5 pt-1 sm:space-y-6">
        <div className="pt-4 border-t border-white/5 sm:pt-5">
          <DashboardMarketBoard />
        </div>

        <div className="pt-5 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Payments</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            <SectionCard
              title={t.dashboard.cards.wallet.title}
              href="/wallet"
              icon={Wallet}
            />
            <SectionCard
              title={t.dashboard.cards.transactions.title}
              href="/transactions"
              icon={ReceiptText}
            />
            <SectionCard title={t.dashboard.cards.pay.title} href="/pay" icon={CreditCard} />
          </div>
        </div>

        <div className="pt-5 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Trade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            <SectionCard title="ELTX Swap" href="/trade" icon={ArrowLeftRight} />
            <SectionCard title="Spot Trade" href="/trade/spot" icon={CandlestickChart} />
            <SectionCard title={t.dashboard.cards.p2p.title} href="/p2p" icon={Handshake} />
          </div>
        </div>

        <div className="pt-5 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Earn</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            <SectionCard title="Staking" href="/staking" icon={Coins} />
            <SectionCard title={t.dashboard.cards.invite.title} href="/referrals" icon={Gift} />
          </div>
        </div>

        <div className="pt-5 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">{t.dashboard.ai.kicker}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            <SectionCard
              title={t.dashboard.cards.aiAgent.title}
              href="/ai"
              icon={Sparkles}
              badge={t.dashboard.ai.kicker}
            />
          </div>
        </div>

        <div className="pt-5 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Profile</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            <SectionCard title={t.dashboard.cards.settings.title} href="/settings" icon={Settings} />
            <SectionCard title={t.dashboard.cards.faq.title} href="/faq" icon={HelpCircle} />
            <SectionCard title={t.dashboard.cards.support.title} href="/support" icon={LifeBuoy} />
            <SectionCard title={t.dashboard.cards.kyc.title} href="/kyc" icon={ShieldCheck} />
          </div>
        </div>
      </div>
    </div>
  );
}
