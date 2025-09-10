'use client';

import { dict, useLang } from '../lib/i18n';

export default function TermsPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const content = {
    en: [
      'By accessing or using the ELTX platform, you agree to these terms and any future updates.',
      "The service is provided 'as is' without warranties; users are responsible for complying with applicable laws.",
      'ELTX may modify or discontinue services at any time. Continued use after changes constitutes acceptance.',
      'Tokens and deposits remain the responsibility of the user. Keep your credentials secure and never share them.',
    ],
    ar: [
      'باستخدامك لمنصة ELTX فإنك توافق على هذه الشروط وأي تحديثات مستقبلية.',
      'يتم تقديم الخدمة كما هي دون أي ضمانات، ويتحمل المستخدمون مسؤولية الالتزام بجميع القوانين المعمول بها.',
      'يجوز لـ ELTX تعديل الخدمات أو إيقافها في أي وقت، ويعد استمرارك في الاستخدام بعد التغييرات قبولًا لها.',
      'تظل الأصول والودائع تحت مسؤولية المستخدم. احرص على حماية بيانات الدخول الخاصة بك وعدم مشاركتها.',
    ],
  } as const;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.terms}</h1>
      {content[lang].map((p, i) => (
        <p key={i} className="opacity-80 text-sm">
          {p}
        </p>
      ))}
    </div>
  );
}
