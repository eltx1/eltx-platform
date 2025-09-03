'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = dict[lang];

  const guestLinks = [
    { href: '/', label: t.nav.home },
    { href: '/faq', label: t.nav.faq },
    { href: '/login', label: t.nav.login },
    { href: '/signup', label: t.nav.signup },
  ];

  const userLinks = [
    { href: '/dashboard', label: t.nav.dashboard },
    { href: '/wallet', label: t.nav.wallet },
    { href: '/transactions', label: t.nav.transactions },
    { href: '/settings', label: t.nav.settings },
  ];

  return (
    <header className="p-4 border-b border-white/10 flex items-center justify-between">
      <Link href="/" className="font-bold tracking-wide">
        {t.site_title}
      </Link>
      <nav className="flex items-center gap-4">
        {(user ? userLinks : guestLinks).map((l) => (
          <Link key={l.href} href={l.href} className="hover:opacity-80">
            {l.label}
          </Link>
        ))}
        {user && (
          <button
            onClick={async () => {
              await logout();
              router.push('/');
            }}
            className="hover:opacity-80"
          >
            {t.nav.logout}
          </button>
        )}
        <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="hover:opacity-80">
          {lang === 'en' ? 'العربية' : 'English'}
        </button>
      </nav>
    </header>
  );
}
