'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CandlestickChart,
  CreditCard,
  Home,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  const iconColor = active ? 'text-violet-600' : 'text-slate-500';
  const labelColor = active ? 'text-violet-700' : 'text-slate-500';

  return (
    <Link
      href={href}
      aria-label={label}
      className="flex flex-col items-center gap-1 text-[11px] font-medium"
    >
      <Icon className={`h-6 w-6 ${iconColor}`} strokeWidth={2.25} />
      <span className={`leading-none ${labelColor}`}>{label}</span>
    </Link>
  );
}

export default function AppBottomNav() {
  const pathname = usePathname();
  const { lang } = useLang();
  const t = dict[lang];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);
  const tradeActive = pathname === '/trade' || pathname?.startsWith('/trade/');

  const navItems = [
    { href: '/dashboard', label: t.appNav.home, icon: Home },
    { href: '/wallet', label: t.appNav.wallet, icon: Wallet },
    { href: '/buy', label: t.appNav.buy, icon: CreditCard },
    { href: '/earn', label: t.appNav.earn, icon: Sparkles },
  ];

  const leftItems = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 px-4">
      <div className="relative mx-auto max-w-3xl">
        <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-6 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
          <div className="flex flex-1 items-center gap-8 pr-10">
            {leftItems.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>

          <div className="flex flex-1 items-center justify-end gap-8 pl-10">
            {rightItems.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>
        </div>

        <Link
          href="/trade/spot"
          aria-label={t.appNav.spotTrade}
          className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-center"
        >
          <div className={`grid h-16 w-16 place-items-center rounded-full bg-violet-600 shadow-[0_14px_28px_rgba(109,40,217,0.35)] ring-8 ring-white ${tradeActive ? 'shadow-[0_20px_35px_rgba(109,40,217,0.45)]' : ''}`}>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-violet-600 shadow-[0_10px_20px_rgba(109,40,217,0.28)]">
              <CandlestickChart className="h-6 w-6" strokeWidth={2.25} />
            </div>
          </div>
          <span className="text-[11px] font-semibold leading-none text-violet-700">{t.appNav.spotTrade}</span>
        </Link>
      </div>
    </nav>
  );
}
