'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  CandlestickChart,
  Home,
  Receipt,
  Send,
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
      className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
        active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'
      }`}
      aria-label={label}
    >
      <Icon className="h-5 w-5" strokeWidth={2.25} />
      <span className="leading-none">{label}</span>
    </Link>
  );
}

export default function AppBottomNav() {
  const pathname = usePathname();
  const { lang } = useLang();
  const t = dict[lang];

  const isActive = (href: string) => (pathname === href || pathname?.startsWith(`${href}/`));

  const items = [
    { href: '/dashboard', label: t.appNav.home, icon: Home },
    { href: '/wallet', label: t.appNav.wallet, icon: Wallet },
    { href: '/pay', label: t.appNav.pay, icon: Send },
    { href: '/transactions', label: t.appNav.transactions, icon: Receipt },
    { href: '/staking', label: t.appNav.staking, icon: Sparkles },
    { href: '/trade', label: t.appNav.swap, icon: ArrowLeftRight },
  ];

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="relative max-w-3xl mx-auto">
        <div className="grid grid-cols-6 items-center rounded-[24px] border border-white/20 bg-white/95 px-3 py-3 text-slate-700 shadow-[0_18px_70px_rgba(104,48,238,0.32)] backdrop-blur-xl">
          {items.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>

        <Link
          href="/trade/spot"
          aria-label={t.appNav.spotTrade}
          className="absolute -top-8 left-1/2 -translate-x-1/2"
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-500 shadow-[0_24px_55px_rgba(109,40,217,0.55)] ring-8 ring-white">
            <CandlestickChart className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <span className="sr-only">{t.appNav.spotTrade}</span>
        </Link>
      </div>
    </nav>
  );
}
