export const PAGE_AD_PLACEMENTS = [
  'for_you',
  'ai',
  'dashboard',
  'wallet',
  'public_profile',
  'public_post',
  'market',
  'p2p',
] as const;

export type PageAdPlacement = (typeof PAGE_AD_PLACEMENTS)[number];

export type PageAdSettings = Record<PageAdPlacement, string>;

export const DEFAULT_PAGE_AD_SETTINGS: PageAdSettings = {
  for_you: '',
  ai: '',
  dashboard: '',
  wallet: '',
  public_profile: '',
  public_post: '',
  market: '',
  p2p: '',
};

function normalizeHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizePageAdSettings(input: unknown): PageAdSettings {
  const parsed = (input && typeof input === 'object' ? input : {}) as Partial<Record<PageAdPlacement, unknown>>;
  const next: PageAdSettings = { ...DEFAULT_PAGE_AD_SETTINGS };

  for (const placement of PAGE_AD_PLACEMENTS) {
    next[placement] = normalizeHtml(parsed[placement]);
  }

  return next;
}

export function toPublicPlacementMap(settings: PageAdSettings): Partial<Record<PageAdPlacement, string>> {
  const placements: Partial<Record<PageAdPlacement, string>> = {};
  for (const placement of PAGE_AD_PLACEMENTS) {
    const html = settings[placement]?.trim();
    if (html) placements[placement] = html;
  }
  return placements;
}
