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
      className="group relative flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3.5 shadow-sm shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-white/90 ring-1 ring-inset ring-white/10 transition group-hover:ring-white/25">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold leading-tight">{title}</div>
            {badge && (
              <span className="rounded-full bg-pink-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <div className="text-[11px] leading-snug text-white/65 line-clamp-2">{subtitle}</div>}
        </div>
      </div>
    </Link>
  );
}
