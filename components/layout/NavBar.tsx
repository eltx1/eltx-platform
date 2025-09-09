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

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
  }, [open]);

  const links: NavLink[] = [
    { href: '/', label: t.nav.home },
    { href: '/wallet', label: t.nav.wallet },
    { href: '/earn', label: t.nav.earn },
    { href: '/faq', label: t.nav.faq },
  ];

  const isActive = (href: string) => (pathname === href ? 'text-yellow-400' : '');

  return (
    <header className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-sm sticky top-0 z-50">
      <Link href="/" className="flex items-center font-bold" aria-label="ELTX Home">
        {logoError ? (
          <span>ELTX</span>
        ) : (
          <Image src="/assets/img/logo.jpeg" alt="ELTX Logo" width={32} height={32} onError={() => setLogoError(true)} />
        )}
      </Link>
      <nav className="hidden sm:flex items-center gap-4">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`hover:opacity-80 ${isActive(l.href)}`}>
            {l.label}
          </Link>
        ))}
        {!user && (
          <>
            <Link href="/login" className="hover:opacity-80">{t.nav.login}</Link>
            <Link href="/signup" className="hover:opacity-80">{t.nav.signup}</Link>
          </>
        )}
        {user && (
          <>
            <Link href="/dashboard" className="hover:opacity-80">{t.nav.dashboard}</Link>
            <button
              onClick={async () => {
                await logout();
              }}
              className="hover:opacity-80"
            >
              {t.nav.logout}
            </button>
          </>
        )}
        <button
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          className="hover:opacity-80"
        >
          {lang === 'en' ? 'AR' : 'EN'}
        </button>
      </nav>
      <button
        className="sm:hidden hover:opacity-80"
        onClick={() => setOpen(true)}
        aria-label="Open Menu"
      >
        <Menu />
      </button>
      <MobileMenu open={open} setOpen={setOpen} links={links} user={user} logout={logout} />
    </header>
  );
}

