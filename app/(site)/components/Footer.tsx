import Link from 'next/link';
import Script from 'next/script';

export default function Footer() {
  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-N82B7F9S45" strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-N82B7F9S45');
        `}
      </Script>
      <footer className="mt-10 border-t border-white/5 p-4 text-center text-xs text-white/60">
        <div className="space-x-4">
          <Link href="/" className="hover:text-white">ELTX</Link>
          <Link href="/faq" className="hover:text-white">FAQ</Link>
        </div>
        <div className="mt-2">© {new Date().getFullYear()} ELTX</div>
      </footer>
    </>
  );
}
