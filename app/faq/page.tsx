'use client';

import { dict, useLang } from '../lib/i18n';

const faqs = [
  { q: 'What is ELTX?', a: 'Placeholder answer.' },
  { q: 'How to deposit?', a: 'Send BNB to your unique address.' },
  { q: 'When will staking launch?', a: 'Soon.' },
  { q: 'Is there a mobile app?', a: 'Not yet.' },
  { q: 'Who can I contact for support?', a: 'support@eltx.online' },
];

export default function FAQPage() {
  const { lang } = useLang();
  const t = dict[lang];
  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.dashboard.cards.faq.title}</h1>
      {faqs.map((f, i) => (
        <details key={i} className="bg-white/5 rounded">
          <summary className="p-2 cursor-pointer">{f.q}</summary>
          <div className="p-2 text-sm opacity-80">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
