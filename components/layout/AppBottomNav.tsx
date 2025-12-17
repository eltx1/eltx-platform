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
      className="group relative flex flex-1 items-center justify-center rounded-3xl px-2 py-2 text-[11px] font-semibold tracking-tight transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
      data-state={active ? 'active' : 'inactive'}
    >
      <span
        className="absolute inset-0 rounded-3xl bg-white/5 opacity-0 blur transition duration-200 group-data-[state=active]:opacity-100"
        aria-hidden
      />
      <span
        className="absolute inset-y-1 left-1/2 h-[82%] w-[72%] -translate-x-1/2 rounded-3xl bg-gradient-to-b from-white/10 via-white/4 to-transparent opacity-0 transition duration-200 group-data-[state=active]:opacity-100"
        aria-hidden
      />
      <span
        className="absolute inset-x-5 bottom-1 h-0.5 rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-indigo-400 opacity-0 transition duration-200 group-hover:opacity-60 group-data-[state=active]:opacity-100"
        aria-hidden
      />

      <div className="relative flex flex-col items-center gap-1">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition duration-200 group-hover:border-white/30 group-hover:text-white group-data-[state=active]:border-fuchsia-300/60 group-data-[state=active]:bg-gradient-to-br group-data-[state=active]:from-violet-600/80 group-data-[state=active]:via-fuchsia-500/80 group-data-[state=active]:to-indigo-500/75 group-data-[state=active]:text-white"
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <span className="text-center leading-tight text-slate-200/90 transition duration-150 group-hover:text-white group-data-[state=active]:text-white">
          {label}
        </span>
      </div>
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
      className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-white/5 bg-[#060515]/95 backdrop-blur-2xl md:hidden"
      role="tablist"
    >
      <div className="relative px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(139,92,246,0.14),transparent_32%),radial-gradient(circle_at_82%_84%,rgba(109,40,217,0.22),transparent_38%)]" />
        <div className="pointer-events-none absolute inset-x-2 bottom-2 top-1 rounded-[26px] border border-white/10 bg-white/10 backdrop-blur-[18px]" />
        <div className="relative grid grid-cols-5 gap-1">
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
