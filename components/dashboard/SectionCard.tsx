'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

export default function SectionCard({
  title,
  subtitle,
  href,
  icon: Icon,
  badge,
}: {
  title: string;
  subtitle?: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition flex flex-col justify-between"
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-6 w-6" />
        {badge && <span className="text-xs bg-pink-500 text-white px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      <div className="font-semibold">{title}</div>
      {subtitle && <div className="text-xs opacity-80">{subtitle}</div>}
    </Link>
  );
}

