'use client';

import { Building2, Briefcase, User } from 'lucide-react';
import { motion } from 'framer-motion';

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
    <section className="py-20 px-4 bg-gradient-to-b from-black via-purple-900/20 to-black">
      <h2 className="text-3xl font-bold text-center mb-12">We serve</h2>
      <div className="grid gap-8 sm:grid-cols-3 max-w-6xl mx-auto">
        {data.map((d, i) => {
          const Icon = d.icon;
          return (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-600 shadow-lg"
            >
              <div className="h-full p-6 rounded-2xl bg-black/60 text-center backdrop-blur-xl border border-white/10">
                <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center shadow">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{d.title}</h3>
                <ul className="text-sm opacity-80 space-y-1">
                  {d.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

