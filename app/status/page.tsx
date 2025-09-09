'use client';

import { dict, useLang } from '../lib/i18n';

export default function StatusPage() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.status}</h1>
      <p className="opacity-80 text-sm">All systems operational.</p>
    </div>
  );
}
