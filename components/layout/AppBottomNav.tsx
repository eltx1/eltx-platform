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
  colorClass,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  colorClass?: string;
}) {
  const resolvedIconColor = active && !colorClass ? 'text-indigo-700' : colorClass ?? 'text-slate-500';
  const resolvedLabelColor = colorClass ?? (active ? 'text-slate-900' : 'text-slate-500');

  return (
    <Link
      href={href}
      className="flex items-center gap-2 text-[12px] font-semibold transition-transform"
      aria-label={label}
    >
      <Icon
        className={`h-5 w-5 transition-transform ${resolvedIconColor} ${active ? 'scale-110' : ''}`}
        strokeWidth={2.25}
      />
      <span className={`leading-none ${resolvedLabelColor}`}>{label}</span>
    </Link>
  );
}

export default function AppBottomNav() {
  const pathname = usePathname();
  const { lang } = useLang();
  const t = dict[lang];

  const isActive = (href: string) => (pathname === href || pathname?.startsWith(`${href}/`));

  const brandColor = 'text-violet-600';

  const leftItems = [
    { href: '/dashboard', label: t.appNav.home, icon: Home, colorClass: brandColor },
    { href: '/wallet', label: t.appNav.wallet, icon: Wallet },
  ];

  const rightItems = [
    { href: '/buy', label: t.appNav.buy, icon: CreditCard },
    { href: '/staking', label: t.appNav.earn, icon: Sparkles },
  ];

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="relative mx-auto max-w-3xl">
        <div className="flex items-center justify-between rounded-[24px] border border-white/20 bg-white/95 px-5 py-4 text-slate-700 shadow-[0_18px_70px_rgba(104,48,238,0.32)] backdrop-blur-xl">
          <div className="flex flex-1 items-center gap-6">
            {leftItems.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>

          <div className="flex flex-1 items-center justify-end gap-6">
            {rightItems.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>
        </div>

        <Link
          href="/trade/spot"
          aria-label={t.appNav.spotTrade}
          className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-center"
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-500 shadow-[0_24px_55px_rgba(109,40,217,0.55)] ring-8 ring-white">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-violet-600 shadow-[0_10px_30px_rgba(109,40,217,0.35)]">
              <CandlestickChart className="h-6 w-6" strokeWidth={2.25} />
            </div>
          </div>
          <span className="text-[12px] font-extrabold leading-none text-violet-700">{t.appNav.spotTrade}</span>
        </Link>
      </div>
    </nav>
  );
}
