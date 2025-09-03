'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = dict[lang];
  const [open, setOpen] = useState(false);

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

  const links = user ? userLinks : guestLinks;
  const NavLinks = () => (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="hover:opacity-80">
          {l.label}
        </Link>
      ))}
      {user && (
        <button
          onClick={async () => {
            await logout();
            router.push('/');
            setOpen(false);
          }}
          className="hover:opacity-80"
        >
          {t.nav.logout}
        </button>
      )}
      <button
        onClick={() => {
          setLang(lang === 'en' ? 'ar' : 'en');
          setOpen(false);
        }}
        className="hover:opacity-80"
      >
        {lang === 'en' ? 'العربية' : 'English'}
      </button>
    </>
  );
  return (
    <header className="p-4 border-b border-white/10 flex items-center justify-between relative">
      <Link href="/" className="font-bold tracking-wide">
        {t.site_title}
      </Link>
      <nav className="hidden sm:flex items-center gap-4">
        <NavLinks />
      </nav>
      <button
        className="sm:hidden hover:opacity-80"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle Menu"
      >
        {open ? <X /> : <Menu />}
      </button>
      {open && (
        <nav className="absolute top-full left-0 w-full bg-black p-4 flex flex-col gap-4 sm:hidden">
          <NavLinks />
        </nav>
      )}
    </header>
  );
}
