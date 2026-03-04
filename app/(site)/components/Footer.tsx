import Link from 'next/link';

export default function Footer() {
  return (
    <>
      <footer className="mt-10 border-t border-white/5 p-4 text-center text-xs text-white/60">
        <div className="space-x-4">
          <Link href="/" className="hover:text-white">LordAi.Net</Link>
          <Link href="/faq" className="hover:text-white">FAQ</Link>
        </div>
        <div className="mt-2">© {new Date().getFullYear()} LordAi.Net</div>
      </footer>
    </>
  );
}
