'use client';

import { dict, useLang } from '../lib/i18n';

export default function AboutPage() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.about}</h1>
      <p className="opacity-80 text-sm">{t.pages.about}</p>
    </div>
  );
}
