'use client';

import type { SocialPost } from './social-store';

export type MonetizationSettings = {
  requiredPremiumFollowers: number;
  payoutPerThousandViews: number;
};

export type PayoutItem = {
  id: string;
  monthKey: string;
  amountUsdt: number;
  views: number;
  status: 'scheduled' | 'in_review' | 'paid';
  createdAt: string;
};

const SETTINGS_KEY = 'lordai.monetization.settings';
const VIEW_BUCKET_KEY = 'lordai.social.view-bucket';
const VIEW_SESSION_PREFIX = 'lordai.social.view-session';
const FOLLOWERS_PREFIX = 'lordai.monetization.premium-followers';
const PAYOUT_PREFIX = 'lordai.monetization.payouts';
const SCHEDULED_VIEWS_PREFIX = 'lordai.monetization.scheduled-views';
const DEFAULT_SETTINGS: MonetizationSettings = { requiredPremiumFollowers: 10, payoutPerThousandViews: 0.01 };

function scopedKey(prefix: string, userId?: string | number | null) {
  const normalized = String(userId ?? 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${prefix}:${normalized}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getMonetizationSettings(): MonetizationSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...readJson<Partial<MonetizationSettings>>(SETTINGS_KEY, {}),
  };
}

export function setMonetizationSettings(value: MonetizationSettings) {
  saveJson(SETTINGS_KEY, {
    requiredPremiumFollowers: Math.max(1, Math.floor(value.requiredPremiumFollowers || DEFAULT_SETTINGS.requiredPremiumFollowers)),
    payoutPerThousandViews: Math.max(0, Number(value.payoutPerThousandViews || DEFAULT_SETTINGS.payoutPerThousandViews)),
  });
}

export function setPremiumFollowersCount(count: number, userId?: string | number | null) {
  saveJson(scopedKey(FOLLOWERS_PREFIX, userId), Math.max(0, Math.floor(count || 0)));
}

export function getPremiumFollowersCount(userId?: string | number | null) {
  return readJson<number>(scopedKey(FOLLOWERS_PREFIX, userId), 0);
}

export function trackPostView(postId: string, viewerId?: string | number | null) {
  const now = Date.now();
  const sessions = readJson<Record<string, number>>(scopedKey(VIEW_SESSION_PREFIX, viewerId), {});
  const lastAt = sessions[postId] || 0;
  if (now - lastAt < 24 * 60 * 60 * 1000) return false;
  sessions[postId] = now;
  saveJson(scopedKey(VIEW_SESSION_PREFIX, viewerId), sessions);

  const bucket = readJson<Record<string, number>>(VIEW_BUCKET_KEY, {});
  bucket[postId] = (bucket[postId] || 0) + 1;
  saveJson(VIEW_BUCKET_KEY, bucket);
  return true;
}

export function getPostViews(post: SocialPost) {
  return Number(post.views || 0);
}

export function getCreatorUniqueViews(posts: SocialPost[], userHandle?: string | null) {
  const normalized = String(userHandle || '').trim().toLowerCase();
  if (!normalized) return 0;
  return posts
    .filter((post) => post.handle.trim().toLowerCase() === normalized)
    .reduce((sum, post) => sum + getPostViews(post), 0);
}

export function resolveCreatorPremiumFollowers(params: {
  posts: SocialPost[];
  userHandle?: string | null;
  userId?: string | number | null;
}) {
  const normalized = String(params.userHandle || '').trim().toLowerCase();
  const persisted = getPremiumFollowersCount(params.userId);
  if (!normalized) return persisted;

  const derived = params.posts.reduce((maxFollowers, post) => {
    if (post.handle.trim().toLowerCase() !== normalized) return maxFollowers;
    return Math.max(maxFollowers, Math.floor(Number(post.authorFollowers || 0)));
  }, 0);

  if (derived > persisted) {
    setPremiumFollowersCount(derived, params.userId);
    return derived;
  }

  return persisted;
}

function monthKeyFor(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export function getPayouts(userId?: string | number | null) {
  return readJson<PayoutItem[]>(scopedKey(PAYOUT_PREFIX, userId), []);
}

export function getScheduledViews(userId?: string | number | null) {
  return readJson<number>(scopedKey(SCHEDULED_VIEWS_PREFIX, userId), 0);
}

export function maybeScheduleMonthlyPayout(params: {
  userId?: string | number | null;
  eligible: boolean;
  totalViews: number;
  payoutPerThousandViews: number;
}) {
  if (typeof window === 'undefined' || !params.eligible) return;
  const now = new Date();
  if (now.getDate() !== 1) return;

  const currentMonth = monthKeyFor(now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthKeyFor(previousMonthDate);

  const payouts = getPayouts(params.userId);
  if (payouts.some((item) => item.monthKey === previousMonth)) return;

  const alreadyScheduledViews = getScheduledViews(params.userId);
  const unscheduledViews = Math.max(0, Math.floor(params.totalViews - alreadyScheduledViews));
  if (!unscheduledViews) return;

  const amountUsdt = Number(((unscheduledViews / 1000) * params.payoutPerThousandViews).toFixed(6));
  const next: PayoutItem = {
    id: `payout-${Date.now()}`,
    monthKey: previousMonth,
    amountUsdt,
    views: unscheduledViews,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };
  saveJson(scopedKey(PAYOUT_PREFIX, params.userId), [next, ...payouts]);
  saveJson(scopedKey(SCHEDULED_VIEWS_PREFIX, params.userId), alreadyScheduledViews + unscheduledViews);
  saveJson(scopedKey(PAYOUT_PREFIX, `${params.userId || 'guest'}-last-run`), currentMonth);
}
