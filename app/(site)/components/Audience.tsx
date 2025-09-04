'use client';

import { Building2, Briefcase, Users } from 'lucide-react';
import { dict, useLang } from '../../lib/i18n';

export default function Audience() {
  const { lang } = useLang();
  const t = dict[lang];
  const items = [
    { icon: Building2, title: t.audience.governments.title, desc: t.audience.governments.desc },
    { icon: Briefcase, title: t.audience.companies.title, desc: t.audience.companies.desc },
    { icon: Users, title: t.audience.individuals.title, desc: t.audience.individuals.desc },
  ];
  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-8">{t.audience.title}</h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="p-6 border border-white/10 rounded-lg text-center hover:bg-white/5 transition"
          >
            <item.icon className="h-10 w-10 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
            <p className="text-sm text-[var(--muted)]">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
