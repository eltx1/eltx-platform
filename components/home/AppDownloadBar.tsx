'use client';

import { Download } from 'lucide-react';
import Link from 'next/link';
import { dict, useLang } from '../../app/lib/i18n';

export default function AppDownloadBar() {
  const { lang } = useLang();
  const t = dict[lang];

  return (
    <div className="fixed inset-x-0 bottom-5 z-40 px-4">
      <div className="mx-auto max-w-5xl rounded-full border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl shadow-black/40">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 text-white font-bold">
              {t.home.app.short}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{t.home.app.title}</p>
              <p className="text-xs text-white/70 leading-snug">{t.home.app.copy}</p>
            </div>
          </div>
          <Link
            href={t.home.app.downloadUrl}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 hover:scale-105 transition"
          >
            <Download className="h-4 w-4" />
            <span>{t.home.app.cta}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
