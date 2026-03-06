'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

export default function SectionCard({
  title,
  href,
  icon: Icon,
  badge,
}: {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-2 rounded-xl border border-[#2f3336] bg-black px-2 py-2 shadow-sm transition hover:border-[#c9a75c]/60 hover:bg-[#16181c]"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2f3336] bg-[#16181c] text-white transition group-hover:border-[#c9a75c]/70">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="truncate text-[0.9rem] font-semibold leading-tight text-white">{title}</div>
        {badge && (
          <span className="rounded-full bg-[#c9a75c]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f4de9a]">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
