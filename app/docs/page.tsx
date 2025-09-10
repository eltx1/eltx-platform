'use client';

import { dict, useLang } from '../lib/i18n';

export default function DocsPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const linkText = { en: 'Read the white paper', ar: 'اقرأ الورقة البيضاء' }[lang];
  const url =
    'https://docs.google.com/document/d/1GvKvPaaUwEH7oVHFG7AnQsAlfQCr7yeM/edit?tab=t.0';
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.docs}</h1>
      <p className="opacity-80 text-sm">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-yellow-500 hover:underline"
        >
          {linkText}
        </a>
      </p>
    </div>
  );
}
