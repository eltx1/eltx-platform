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
      className="group relative flex items-center gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-3 shadow-sm transition hover:border-[#1d9bf0]/60 hover:bg-[#16181c]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2f3336] bg-[#16181c] text-white transition group-hover:border-[#1d9bf0]/70">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="truncate text-sm font-semibold leading-tight text-white">{title}</div>
        {badge && (
          <span className="rounded-full bg-[#1d9bf0]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7ec8ff]">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
