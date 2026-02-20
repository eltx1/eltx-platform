'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, Coins, Home, Wallet } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      aria-selected={active}
      role="tab"
      className={`group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${
        active ? 'text-white' : 'text-white/65 hover:text-white'
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
          active ? 'border-[#c9a75c] bg-[#c9a75c]/20' : 'border-[#2f3336] bg-[#111] group-hover:bg-white/10'
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>

      <span className="line-clamp-1 text-center leading-tight">{label}</span>
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
    { href: '/staking', label: t.appNav.staking, icon: Coins },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-[#2f3336] bg-black/95 backdrop-blur-xl md:hidden" role="tablist">
      <div className="relative px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        <div className="relative flex items-center justify-between gap-2">
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
