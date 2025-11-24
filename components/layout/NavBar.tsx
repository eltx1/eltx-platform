'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '../../app/lib/auth';
import MobileMenu from './MobileMenu';
import { dict, useLang } from '../../app/lib/i18n';

interface NavLink { href: string; label: string; }

export default function NavBar() {
  const { user, logout } = useAuth();
  const { lang, setLang } = useLang();
  const t = dict[lang];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const hideNav = pathname?.startsWith('/mo');

  useEffect(() => {
    if (hideNav) {
      return;
    }

    document.body.style.overflow = open ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [hideNav, open]);

  if (hideNav) {
    return null;
  }

  const links: NavLink[] = [
    { href: '/', label: t.nav.home },
    { href: '/wallet', label: t.nav.wallet },
    { href: '/trade', label: t.nav.trade },
    { href: '/earn', label: t.nav.earn },
    { href: '/faq', label: t.nav.faq },
  ];

  const isActive = (href: string) => (pathname === href ? 'text-yellow-400' : '');

  return (
    <header className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 font-bold" aria-label="ELTX Home">
          {logoError ? (
            <span className="text-lg">ELTX</span>
          ) : (
            <Image src="/assets/img/logo.jpeg" alt="ELTX Logo" width={32} height={32} onError={() => setLogoError(true)} className="rounded-lg" />
          )}
          <span className="hidden sm:inline text-sm text-white/70">Enterprise crypto protocol</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`hover:text-white/90 transition-colors ${isActive(l.href)}`}>
              {l.label}
            </Link>
          ))}
          {!user && (
            <>
              <Link href="/login" className="hover:text-white/90">{t.nav.login}</Link>
              <Link
                href="/signup"
                className="px-3 py-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-cyan-500 text-white font-semibold shadow-lg shadow-purple-900/30 hover:opacity-90"
              >
                {t.nav.signup}
              </Link>
            </>
          )}
          {user && (
            <>
              <Link href="/dashboard" className="hover:text-white/90">{t.nav.dashboard}</Link>
              <button
                onClick={async () => {
                  await logout();
                }}
                className="hover:text-white/90"
              >
                {t.nav.logout}
              </button>
            </>
          )}
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/10"
          >
            {lang === 'en' ? 'AR' : 'EN'}
          </button>
        </nav>
        <button
          className="sm:hidden rounded-full border border-white/15 p-2 hover:bg-white/10"
          onClick={() => setOpen(true)}
          aria-label="Open Menu"
        >
          <Menu />
        </button>
      </div>
      <MobileMenu open={open} setOpen={setOpen} links={links} user={user} logout={logout} />
    </header>
  );
}

