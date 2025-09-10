'use client';

import Link from 'next/link';
import { dict, useLang } from '../../app/lib/i18n';

export default function Footer() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <footer className="border-t border-white/10 p-6 text-center text-sm bg-black/40 backdrop-blur-sm">
      <div className="mb-3 font-semibold">ELTX</div>
      <div className="opacity-80 mb-4">{t.footer.tagline}</div>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/about" className="hover:opacity-80">{t.footer.about}</Link>
        <Link href="/docs" className="hover:opacity-80">{t.footer.docs}</Link>
        <Link href="/terms" className="hover:opacity-80">{t.footer.terms}</Link>
        <Link href="/privacy" className="hover:opacity-80">{t.footer.privacy}</Link>
        <Link href="/status" className="hover:opacity-80">{t.footer.status}</Link>
        <Link href="/contact" className="hover:opacity-80">{t.footer.contact}</Link>
      </div>
    </footer>
  );
}
