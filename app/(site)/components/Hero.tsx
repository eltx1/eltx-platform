'use client';

import { dict, useLang } from '../../lib/i18n';

export default function Hero() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <section className="hero py-4 text-center space-y-2">
      <div className="flex items-center justify-center">
        <img src="/assets/img/logo.jpeg" alt="ELTX" className="w-16 h-16 rounded" />
      </div>
      <h1 className="text-3xl md:text-5xl font-black">{t.hero_title}</h1>
      <p className="text-[var(--muted)]">{t.hero_sub}</p>
    </section>
  );
}
