'use client';

import { dict, useLang } from '../../lib/i18n';

export default function PartnersPage() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.dashboard.cards.partners.title}</h1>
      <div className="text-sm opacity-70">{t.common.soon}</div>
    </div>
  );
}
