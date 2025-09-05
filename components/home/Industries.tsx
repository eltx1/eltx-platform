'use client';

import { Building2, Briefcase, User } from 'lucide-react';

const data = [
  {
    icon: Building2,
    title: 'Governments',
    points: ['Transparent records', 'Secure payments'],
  },
  {
    icon: Briefcase,
    title: 'Companies',
    points: ['Payroll automation', 'Cross-border transfers'],
  },
  {
    icon: User,
    title: 'Individuals',
    points: ['Fast remittance', 'Easy savings'],
  },
];

export default function Industries() {
  return (
    <section className="py-16 px-4">
      <h2 className="text-2xl font-bold text-center mb-8">We serve</h2>
      <div className="grid gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
        {data.map((d) => {
          const Icon = d.icon;
          return (
            <div key={d.title} className="p-6 rounded-2xl bg-white/5 text-center shadow">
              <Icon className="mx-auto mb-4 h-8 w-8" />
              <h3 className="font-semibold mb-2">{d.title}</h3>
              <ul className="text-sm opacity-80 space-y-1">
                {d.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

