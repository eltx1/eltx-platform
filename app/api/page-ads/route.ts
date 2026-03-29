import { NextRequest, NextResponse } from 'next/server';
import { readPageAdInjectSettings, readPageAdSettings } from '../../lib/page-ads.server';
import { PAGE_AD_PLACEMENTS, toPublicPlacementMap, type PageAdPlacement } from '../../lib/page-ads';

export async function GET(request: NextRequest) {
  const settings = await readPageAdSettings();
  const injectSettings = await readPageAdInjectSettings();
  const publicMap = toPublicPlacementMap(settings);
  const publicInjectMap = toPublicPlacementMap(injectSettings);
  const placement = request.nextUrl.searchParams.get('placement')?.trim() as PageAdPlacement | undefined;
  const kind = request.nextUrl.searchParams.get('kind')?.trim();

  if (placement && PAGE_AD_PLACEMENTS.includes(placement)) {
    if (kind === 'inject') {
      return NextResponse.json({ placement, html: publicInjectMap[placement] || '' });
    }
    return NextResponse.json({ placement, html: publicMap[placement] || '' });
  }

  return NextResponse.json({ placements: publicMap, injectPlacements: publicInjectMap });
}
