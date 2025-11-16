export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';

import ClientBuy from './ClientBuy';

export default function BuyPage() {
  return (
    <Suspense fallback="Loading…">
      <ClientBuy />
    </Suspense>
  );
}
