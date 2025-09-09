'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { dict, useLang } from '../../app/lib/i18n';

interface NavLink { href: string; label: string; }

export default function MobileMenu({
  open,
  setOpen,
  links,
  user,
  logout,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  links: NavLink[];
  user: any;
  logout: () => Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();
  const t = dict[lang];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      window.addEventListener('keydown', onKey);
      const first = panelRef.current?.querySelector<HTMLElement>('a,button');
      first?.focus();
    }
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <>
      <div
        data-open={open}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm opacity-0 pointer-events-none data-[open=true]:opacity-100 data-[open=true]:pointer-events-auto transition-opacity duration-200 z-[60]"
        onClick={() => setOpen(false)}
      />
      <nav
        ref={panelRef}
        data-open={open}
        className="fixed top-0 right-0 h-full w-80 max-w-[85%] bg-neutral-900 text-white translate-x-full data-[open=true]:translate-x-0 transition-transform duration-200 z-[70] p-6 flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
      >
        <button className="self-end mb-2" onClick={() => setOpen(false)} aria-label="Close Menu">
          <X />
        </button>
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="hover:opacity-80">
            {l.label}
          </Link>
        ))}
        {!user && (
          <>
            <Link href="/login" onClick={() => setOpen(false)} className="hover:opacity-80">
              {t.nav.login}
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="hover:opacity-80">
              {t.nav.signup}
            </Link>
          </>
        )}
        {user && (
          <>
            <Link href="/dashboard" onClick={() => setOpen(false)} className="hover:opacity-80">
              {t.nav.dashboard}
            </Link>
            <button
              onClick={async () => {
                await logout();
                setOpen(false);
              }}
              className="hover:opacity-80 text-left"
            >
              {t.nav.logout}
            </button>
          </>
        )}
      </nav>
    </>
  );
}

