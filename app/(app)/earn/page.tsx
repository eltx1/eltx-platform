'use client';

import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function EarnPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  return (
    <div className="p-4 space-y-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold">Earn</h1>
      <div className="grid gap-4">
        <Link
          href="/earn/staking"
          className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition flex justify-between items-center"
        >
          <div>
            <div className="font-semibold">Staking</div>
            <div className="text-sm opacity-75">Lock ELTX to earn daily rewards</div>
          </div>
          <span className="text-pink-400 text-lg">→</span>
        </Link>
      </div>
    </div>
  );
}
