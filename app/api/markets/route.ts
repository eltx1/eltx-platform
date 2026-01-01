import { NextResponse } from 'next/server';
import { getHomeMarkets } from '../../lib/home-data';

export const revalidate = 60;

export async function GET() {
  try {
    const markets = await getHomeMarkets();
    return NextResponse.json({ markets });
  } catch (err) {
    console.error('[api/markets] failed to load', err);
    return NextResponse.json({ markets: [] }, { status: 500 });
  }
}
