import { NextRequest, NextResponse } from 'next/server';
import { readPageAdSettings } from '../../lib/page-ads.server';
import { PAGE_AD_PLACEMENTS, toPublicPlacementMap, type PageAdPlacement } from '../../lib/page-ads';

export async function GET(request: NextRequest) {
  const settings = await readPageAdSettings();
  const publicMap = toPublicPlacementMap(settings);
  const placement = request.nextUrl.searchParams.get('placement')?.trim() as PageAdPlacement | undefined;

  if (placement && PAGE_AD_PLACEMENTS.includes(placement)) {
    return NextResponse.json({ placement, html: publicMap[placement] || '' });
  }

  return NextResponse.json({ placements: publicMap });
}
