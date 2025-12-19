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
  ShoppingCart,
  Gift,
} from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
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
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.dashboard.title}</h1>
      <div className="p-5 rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="text-sm opacity-80">{t.dashboard.balanceCard.title}</div>
          <div className="text-2xl font-bold">
            {loadingBalance ? t.trade.loading : balanceDisplay}
          </div>
          {!loadingBalance && !hasBalance && (
            <div className="text-xs opacity-70">{t.dashboard.balanceCard.empty}</div>
          )}
          {eltxAsset && (
            <div className="pt-2 space-y-2 text-xs">
              <div className={`flex flex-wrap items-center justify-between gap-2 ${changeColor}`}>
                <span>{t.dashboard.balanceCard.change24h}</span>
                <span>
                  {changeStats ? changeStats.formattedValue : t.dashboard.balanceCard.noChange}
                  {changeStats?.formattedPercent ? ` (${changeStats.formattedPercent})` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-white/70">
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
      <div className="space-y-8 pt-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase text-white/60">{t.dashboard.ai.kicker}</p>
              <h2 className="text-lg font-semibold">{t.dashboard.ai.title}</h2>
              <p className="text-sm text-white/60">{t.dashboard.ai.description}</p>
            </div>
            <a href="/ai" className="btn btn-primary self-start sm:self-auto">
              {t.dashboard.ai.cta}
            </a>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/80">Payments</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard
              title={t.dashboard.cards.buy.title}
              subtitle={t.dashboard.cards.buy.subtitle}
              href="/buy"
              icon={ShoppingCart}
            />
            <SectionCard
              title={t.dashboard.cards.wallet.title}
              subtitle={t.dashboard.cards.wallet.subtitle}
              href="/wallet"
              icon={Wallet}
            />
            <SectionCard
              title={t.dashboard.cards.transactions.title}
              subtitle={t.dashboard.cards.transactions.subtitle}
              href="/transactions"
              icon={ReceiptText}
            />
            <SectionCard
              title={t.dashboard.cards.pay.title}
              subtitle={t.dashboard.cards.pay.subtitle}
              href="/pay"
              icon={CreditCard}
            />
          </div>
        </div>

        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/80">Trade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title="ELTX Swap" subtitle="Convert to ELTX" href="/trade" icon={ArrowLeftRight} />
            <SectionCard title="Spot Trade" subtitle="Order book trading" href="/trade/spot" icon={CandlestickChart} />
          </div>
        </div>

        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/80">Earn</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title="Staking" href="/staking" icon={Coins} />
            <SectionCard
              title={t.dashboard.cards.invite.title}
              subtitle={t.dashboard.cards.invite.subtitle}
              href="/referrals"
              icon={Gift}
            />
          </div>
        </div>

        <div className="pt-8 border-t border-white/10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/80">Profile</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SectionCard title={t.dashboard.cards.settings.title} href="/settings" icon={Settings} />
            <SectionCard title={t.dashboard.cards.faq.title} href="/faq" icon={HelpCircle} />
            <SectionCard
              title={t.dashboard.cards.kyc.title}
              subtitle={t.dashboard.cards.kyc.subtitle}
              href="/kyc"
              icon={ShieldCheck}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
