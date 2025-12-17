'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, Coins, CreditCard, Home, Wallet } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      aria-selected={active}
      role="tab"
      className="group relative flex h-[3.5rem] w-full flex-row items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 text-[11px] font-semibold tracking-tight transition-all duration-200 hover:border-white/20 hover:bg-white/10"
      data-state={active ? 'active' : 'inactive'}
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition-all duration-200 ${
          active
            ? 'bg-gradient-to-br from-violet-600/70 via-fuchsia-500/70 to-indigo-500/70 text-white shadow-[0_10px_30px_rgba(76,29,149,0.45)] ring-1 ring-violet-200/60'
            : 'bg-white/5 text-slate-300/80 ring-1 ring-white/10 group-hover:text-slate-100'
        }`}
      >
        <Icon
          className={`h-5 w-5 transition-colors duration-150 ${
            active ? 'text-white' : 'text-slate-200/70 group-hover:text-slate-100'
          }`}
          strokeWidth={2.25}
        />
      </div>
      <div className="min-w-0 flex-1">
        <span
          className={`line-clamp-1 text-left text-xs leading-tight transition-colors duration-150 ${
            active
              ? 'text-white drop-shadow-[0_1px_8px_rgba(124,58,237,0.35)]'
              : 'text-slate-200/90 group-hover:text-slate-100'
          }`}
        >
          {label}
        </span>
      </div>
      <span
        className="absolute inset-0 -z-10 rounded-2xl opacity-0 transition-opacity duration-200 group-data-[state=active]:opacity-100"
        aria-hidden
      />
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
    <nav
      className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-white/5 bg-[#0c0a1a]/95 backdrop-blur-xl md:hidden"
      role="tablist"
    >
      <div className="relative overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(139,92,246,0.12),transparent_32%),radial-gradient(circle_at_80%_78%,rgba(109,40,217,0.16),transparent_30%)]" />
        <div className="relative grid h-[4.5rem] grid-cols-5 items-stretch gap-2">
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
    </nav>
  );
}
