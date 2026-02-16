'use client';

import { Download } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { dict, useLang } from '../../app/lib/i18n';

export default function AppDownloadBar() {
  const { lang } = useLang();
  const t = dict[lang];
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:pb-6">
      <div className="pointer-events-auto mx-auto max-w-5xl rounded-full border border-white/15 bg-black shadow-2xl shadow-black/50 ring-1 ring-white/5">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:gap-6 md:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {!logoError ? (
              <Image
                src="/assets/img/logo.jpeg"
                alt="LordAi.Net logo"
                width={44}
                height={44}
                className="h-11 w-11 rounded-full border border-white/10 bg-black/40 object-cover shadow-inner shadow-purple-900/30"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-700 to-cyan-400 text-white font-bold">
                {t.home.app.short}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{t.home.app.title}</p>
              <p className="text-xs text-white/70 leading-snug line-clamp-2">{t.home.app.copy}</p>
            </div>
          </div>
          <a
            href={t.home.app.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-700 via-fuchsia-600 to-cyan-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:scale-105"
          >
            <Download className="h-4 w-4" />
            <span>{t.home.app.cta}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
