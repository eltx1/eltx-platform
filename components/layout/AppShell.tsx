'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Bell, Mail, UserRound, Sparkles, Wallet, ShieldCheck } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

const items = [
  { href: '/dashboard', key: 'home', icon: Home },
  { href: '/trade/spot', key: 'explore', icon: Search },
  { href: '/transactions', key: 'alerts', icon: Bell },
  { href: '/support', key: 'messages', icon: Mail },
  { href: '/wallet', key: 'wallet', icon: Wallet },
  { href: '/ai', key: 'ai', icon: Sparkles },
  { href: '/kyc', key: 'kyc', icon: ShieldCheck },
  { href: '/profile', key: 'profile', icon: UserRound },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang } = useLang();
  const t = dict[lang];

  const labels: Record<(typeof items)[number]['key'], string> = {
    home: t.appNav.home,
    explore: lang === 'ar' ? 'استكشاف' : 'Explore',
    alerts: lang === 'ar' ? 'التحديثات' : 'Updates',
    messages: lang === 'ar' ? 'الدعم' : 'Support',
    wallet: t.appNav.wallet,
    ai: lang === 'ar' ? 'الذكاء الاصطناعي' : 'AI',
    kyc: lang === 'ar' ? 'التحقق' : 'Verification',
    profile: lang === 'ar' ? 'الملف الشخصي' : 'Profile',
  };

  return (
    <div className="x-shell min-h-screen">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-5 px-3 pb-[calc(env(safe-area-inset-bottom)+120px)] pt-4 md:grid-cols-[250px_minmax(0,1fr)] md:px-5 xl:grid-cols-[270px_minmax(0,1fr)_300px]">
        <aside className="x-rail sticky top-4 hidden h-[calc(100vh-2rem)] md:flex md:flex-col md:justify-between">
          <div className="space-y-2">
            {items.map(({ href, key, icon: Icon }) => {
              const active = pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <Link key={href} href={href} className={`x-nav-item ${active ? 'is-active' : ''}`}>
                  <Icon className="h-5 w-5" />
                  <span>{labels[key]}</span>
                </Link>
              );
            })}
          </div>
          <div className="x-card p-4 text-sm text-white/70">{lang === 'ar' ? 'تجربة حديثة على ستايل X مع المحافظة على كل وظائف المنصة.' : 'Modern X-inspired experience while keeping the full platform features.'}</div>
        </aside>

        <main className="min-w-0 space-y-4">{children}</main>

        <aside className="x-rail sticky top-4 hidden h-fit space-y-4 xl:block">
          <div className="x-card p-4">
            <h3 className="text-sm font-semibold">{lang === 'ar' ? 'الترند الآن' : 'Trends now'}</h3>
            <ul className="mt-3 space-y-3 text-sm text-white/70">
              <li>#ELTX</li>
              <li>#AITrading</li>
              <li>#Web3Social</li>
            </ul>
          </div>
          <div className="x-card p-4 text-sm text-white/70">{lang === 'ar' ? 'بدّل اللغة من الهيدر بين English و العربية في أي وقت.' : 'Switch language from header between English and Arabic anytime.'}</div>
        </aside>
      </div>
    </div>
  );
}
