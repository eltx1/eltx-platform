'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
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
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="group flex flex-col items-center gap-1 text-[11px] font-semibold tracking-tight"
    >
      <div
        className={`grid h-11 w-11 place-items-center rounded-2xl transition-all duration-200 ${
          active
            ? 'bg-violet-50 text-violet-600 shadow-[0_10px_26px_rgba(124,58,237,0.15)] ring-1 ring-violet-100'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <Icon className="h-6 w-6" strokeWidth={2.25} />
      </div>
      <span
        className={`leading-none transition-colors duration-150 ${
          active ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'
        }`}
      >
        {label}
      </span>
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
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
      <div className="relative mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/90 shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <div className="relative flex items-center justify-between px-6 py-4">
            <div className="flex flex-1 items-center gap-6 pr-12">
              {leftItems.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>

            <div className="flex flex-1 items-center justify-end gap-6 pl-12">
              {rightItems.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        </div>

        <Link
          href="/trade/spot"
          aria-label={t.appNav.spotTrade}
          className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-center"
        >
          <div
            className={`grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-violet-500 to-violet-600 shadow-[0_18px_32px_rgba(124,58,237,0.4)] ring-[10px] ring-white ${
              tradeActive ? 'shadow-[0_24px_40px_rgba(124,58,237,0.45)] scale-[1.03]' : ''
            } transition-transform duration-150`}
          >
            <ArrowLeftRight className="h-7 w-7 text-white" strokeWidth={2.4} />
          </div>
          <span className="text-[11px] font-semibold leading-none text-slate-900 drop-shadow-sm">
            {t.appNav.spotTrade}
          </span>
        </Link>
      </div>
    </nav>
  );
}
