'use client';

import { dict, useLang } from '../../lib/i18n';

export default function Hero() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <section className="relative overflow-hidden py-16 text-center space-y-4">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-purple-700/20 via-transparent to-transparent" />
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <div className="animate-blob absolute top-0 left-1/2 w-64 h-64 bg-pink-500 opacity-20 blur-3xl rounded-full" />
        <div className="animate-blob animation-delay-2000 absolute bottom-0 right-0 w-64 h-64 bg-purple-500 opacity-20 blur-3xl rounded-full" />
        <div className="animate-blob animation-delay-4000 absolute top-1/3 left-0 w-64 h-64 bg-indigo-500 opacity-20 blur-3xl rounded-full" />
      </div>
      <div className="flex items-center justify-center">
        <img src="/assets/img/logo.jpeg" alt="ELTX" className="w-20 h-20 rounded" />
      </div>
      <h1 className="text-3xl md:text-5xl font-black">{t.hero_title}</h1>
      <p className="text-[var(--muted)] max-w-md mx-auto">{t.hero_sub}</p>
    </section>
  );
}
