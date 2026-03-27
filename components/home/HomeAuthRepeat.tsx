'use client';

import Link from 'next/link';
import { LogIn, UserPlus } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';

export default function HomeAuthRepeat() {
  const { lang } = useLang();
  const t = dict[lang].home.authRepeat;

  return (
    <section className="py-10 text-white md:py-14">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="x-card space-y-4 p-5 md:p-7">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{t.eyebrow}</p>
          <h2 className="max-w-3xl text-xl font-semibold md:text-2xl">{t.title}</h2>
          <p className="text-sm text-white/70">{t.subtitle}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[#c9a75c] px-6 py-3 text-sm font-semibold text-black hover:brightness-110"
            >
              <UserPlus className="h-4 w-4" />
              {t.signup}
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1d1f23]"
            >
              <LogIn className="h-4 w-4" />
              {t.login}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
