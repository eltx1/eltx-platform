'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dict, useLang } from '../../app/lib/i18n';

export default function Footer() {
  const { lang } = useLang();
  const t = dict[lang];
  const pathname = usePathname();
  if (pathname?.startsWith('/mo')) {
    return null;
  }
  return (
    <footer className="border-t border-white/10 bg-neutral-950/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-6 md:grid-cols-3 text-sm text-white/80">
        <div className="space-y-2">
          <div className="text-lg font-semibold">ELTX</div>
          <div>{t.footer.tagline}</div>
          <div className="text-xs text-white/60">Trusted rails for trading، staking، and secure wallets.</div>
        </div>
        <div className="space-y-3">
          <div className="font-semibold text-white">Explore</div>
          <div className="flex flex-wrap gap-3">
            <Link href="/about" className="hover:text-white">{t.footer.about}</Link>
            <Link href="/docs" className="hover:text-white">{t.footer.docs}</Link>
            <Link href="/terms" className="hover:text-white">{t.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-white">{t.footer.privacy}</Link>
            <Link href="/status" className="hover:text-white">{t.footer.status}</Link>
            <Link href="/contact" className="hover:text-white">{t.footer.contact}</Link>
          </div>
        </div>
        <div className="space-y-3">
          <div className="font-semibold text-white">Stay connected</div>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs" className="rounded-full border border-white/10 px-3 py-2 hover:bg-white/10">Docs</Link>
            <Link href="/status" className="rounded-full border border-white/10 px-3 py-2 hover:bg-white/10">Status</Link>
            <Link href="/contact" className="rounded-full border border-white/10 px-3 py-2 hover:bg-white/10">Support</Link>
          </div>
          <div className="text-xs text-white/60">© {new Date().getFullYear()} ELTX. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
