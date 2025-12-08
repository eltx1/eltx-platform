'use client';

import Link from 'next/link';
import { LogIn, UserPlus } from 'lucide-react';

interface SectionCtaProps {
  eyebrow?: string;
  title: string;
  copy: string;
}

export default function SectionCta({ eyebrow = 'Get started', title, copy }: SectionCtaProps) {
  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-lg shadow-purple-900/20 backdrop-blur-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">{eyebrow}</p>
          <h3 className="text-xl md:text-2xl font-bold">{title}</h3>
          <p className="text-sm md:text-base text-white/75">{copy}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-cyan-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-purple-900/40 transition-transform hover:scale-105"
          >
            <span className="absolute inset-0 rounded-full bg-white/10 opacity-0 blur transition-opacity group-hover:opacity-100" />
            <UserPlus className="h-4 w-4" />
            <span>Create account</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white/90 shadow-inner shadow-black/30 transition hover:border-white/30 hover:bg-white/15"
          >
            <LogIn className="h-4 w-4" />
            <span>Sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
