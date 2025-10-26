'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import logo from '../../../public/assets/img/logo.jpeg';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = dict[lang];
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab' && open && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('a,button');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
      const first = panelRef.current?.querySelector<HTMLElement>('a,button');
      first?.focus();
    } else {
      document.body.style.overflow = '';
      btnRef.current?.focus();
    }
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
      <Link href="/" className="flex items-center gap-2" aria-label={t.site_title}>
        <Image src={logo} alt="ELTX" width={32} height={32} className="rounded" />
      </Link>
      <nav className="hidden sm:flex items-center gap-4">
        <NavLinks />
      </nav>
      <button
        ref={btnRef}
        className="sm:hidden hover:opacity-80"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle Menu"
      >
        {open ? <X /> : <Menu />}
      </button>
      <div
        data-open={open}
        className="fixed inset-0 bg-black/50 opacity-0 pointer-events-none data-[open=true]:opacity-100 data-[open=true]:pointer-events-auto transition-opacity duration-200 z-[90]"
        onClick={() => setOpen(false)}
      />
      <nav
        ref={panelRef}
        data-open={open}
        className="fixed top-0 right-0 h-full w-4/5 max-w-xs bg-neutral-900 text-white shadow-2xl translate-x-full data-[open=true]:translate-x-0 transition-transform duration-200 z-[100] p-4 flex flex-col gap-4 sm:hidden"
        role="dialog"
        aria-modal="true"
      >
        <button className="self-end mb-2" onClick={() => setOpen(false)} aria-label="Close Menu">
          <X />
        </button>
        <NavLinks />
      </nav>
    </header>
  );
}
