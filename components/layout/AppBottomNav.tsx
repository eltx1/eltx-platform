'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, Coins, CreditCard, Home, Wallet } from 'lucide-react';
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
            ? 'bg-gradient-to-b from-white/20 via-violet-500/20 to-violet-700/30 text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] ring-1 ring-violet-300/60'
            : 'bg-white/5 text-slate-200/70 ring-1 ring-white/5 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon className="h-6 w-6" strokeWidth={2.25} />
      </div>
      <span
        className={`leading-none transition-colors duration-150 ${
          active ? 'text-white' : 'text-slate-200/70 group-hover:text-white'
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

  const navItems = [
    { href: '/dashboard', label: t.appNav.home, icon: Home },
    { href: '/wallet', label: t.appNav.wallet, icon: Wallet },
    { href: '/trade/spot', label: t.appNav.spotTrade, icon: CandlestickChart, activeRoot: '/trade' },
    { href: '/buy', label: t.appNav.buy, icon: CreditCard },
    { href: '/staking', label: t.appNav.staking, icon: Coins },
  ];

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 w-full px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
      <div className="relative w-full">
        <div className="relative overflow-hidden rounded-[26px] border border-violet-400/10 bg-[#0c0a1a]/90 shadow-[0_-12px_34px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(139,92,246,0.12),transparent_32%),radial-gradient(circle_at_80%_78%,rgba(109,40,217,0.16),transparent_30%)]" />
          <div className="relative grid h-20 grid-cols-5 items-center px-5 py-3">
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.activeRoot ?? item.href)}
              />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
