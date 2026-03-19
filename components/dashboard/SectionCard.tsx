'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

export default function SectionCard({
  title,
  href,
  icon: Icon,
  badge,
  compact = false,
}: {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center rounded-xl border border-[#2f3336] bg-black shadow-sm transition hover:border-[#c9a75c]/60 hover:bg-[#16181c] ${compact ? 'gap-1.5 px-1.5 py-1.5' : 'gap-2 px-2 py-2'}`}
    >
      <div
        className={`flex items-center justify-center rounded-full border border-[#2f3336] bg-[#16181c] text-white transition group-hover:border-[#c9a75c]/70 ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
      >
        <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </div>
      <div className={`flex min-w-0 flex-1 items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        <div className={`truncate font-semibold leading-tight text-white ${compact ? 'text-[0.72rem]' : 'text-[0.9rem]'}`}>{title}</div>
        {badge && (
          <span className="rounded-full bg-[#c9a75c]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f4de9a]">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
