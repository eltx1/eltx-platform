'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-white/10 p-6 text-center text-sm bg-black/40 backdrop-blur-sm">
      <div className="mb-3 font-semibold">ELTX</div>
      <div className="opacity-80 mb-4">The utility token platform.</div>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/about" className="hover:opacity-80">About</Link>
        <Link href="/docs" className="hover:opacity-80">Docs</Link>
        <Link href="/terms" className="hover:opacity-80">Terms</Link>
        <Link href="/privacy" className="hover:opacity-80">Privacy</Link>
        <Link href="/status" className="hover:opacity-80">Status</Link>
      </div>
    </footer>
  );
}
