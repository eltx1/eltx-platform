'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, Home, Send, Sparkles, Wallet } from 'lucide-react';
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
      className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
        active ? 'text-white' : 'text-white/70 hover:text-white'
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
    { href: '/earn', label: t.appNav.earn, icon: Sparkles },
  ];

  return (
    <nav className="md:hidden fixed inset-x-3 bottom-4 z-40">
      <div className="relative">
        <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-2xl shadow-[0_12px_45px_rgba(99,102,241,0.28)]">
          {items.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>

        <Link
          href="/trade/spot"
          aria-label={t.appNav.spotTrade}
          className="absolute -top-5 left-1/2 -translate-x-1/2"
        >
          <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-indigo-500 via-violet-500 to-purple-400 shadow-[0_16px_40px_rgba(109,40,217,0.45)] grid place-items-center ring-4 ring-neutral-950">
            <CandlestickChart className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <span className="sr-only">{t.appNav.spotTrade}</span>
        </Link>
      </div>
    </nav>
  );
}
