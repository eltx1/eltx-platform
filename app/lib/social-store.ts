'use client';

import { imageRemotePatterns } from './image-remote-patterns.mjs';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, normalizeFeedAlgorithmSettings, type FeedAlgorithmSettings } from './feed-algorithm';
import { apiFetch } from './api';

export type SocialPost = {
  id: string;
  authorName: string;
  handle: string;
  profileId: string;
  content: string;
  createdAt: string;
  avatarUrl?: string | null;
  imageUrl?: string | null;
  likes: number;
  comments: number;
  reposts: number;
  views: number;
  authorFollowers?: number;
  isFollowed?: boolean;
  isPremium?: boolean;
  viewerLiked?: boolean;
  viewerReposted?: boolean;
  commentsList?: SocialComment[];
};

export type SocialProfile = {
  publicName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
};

export type SocialComment = {
  id: string;
  postId: string;
  authorName: string;
  handle: string;
  content: string;
  createdAt: string;
};

const PROFILE_KEY = 'lordai.social.profile';
const WORD_LIMIT_KEY = 'lordai.social.postWordLimit';
const FOLLOWING_KEY = 'lordai.social.following';
const USER_SCOPE_KEY = 'guest';
const MAX_IMAGE_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const VIEW_BUCKET_KEY = 'lordai.social.view-bucket';

type FollowingMap = Record<string, boolean>;
type UserScopeId = string | number | null | undefined;

export type PersistResult = {
  ok: boolean;
  reason?: 'quota' | 'unknown';
};

const DEFAULT_AVATAR_URL = '/assets/img/logo-new.svg';

const defaultProfile: SocialProfile = {
  publicName: 'Creator',
  handle: '@creator',
  bio: '',
  avatarUrl: DEFAULT_AVATAR_URL,
};

type ProfileSeed = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
};

function sanitizeHandleToken(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .toLowerCase();
}

function buildDefaultProfile(userId?: UserScopeId, seed?: ProfileSeed): SocialProfile {
  const normalizedUserId = userId == null ? '' : String(userId).trim();
  const emailPrefix = String(seed?.email || '').split('@')[0] || '';
  const handleToken = sanitizeHandleToken(String(seed?.username || '').trim())
    || sanitizeHandleToken(emailPrefix)
    || sanitizeHandleToken(`user${normalizedUserId}`)
    || 'creator';

  const publicName = String(seed?.name || '').trim()
    || String(seed?.username || '').trim()
    || (emailPrefix ? emailPrefix.replace(/[._-]+/g, ' ') : '')
    || (normalizedUserId ? `User ${normalizedUserId}` : defaultProfile.publicName);

  return {
    publicName,
    handle: `@${handleToken}`,
    bio: '',
    avatarUrl: DEFAULT_AVATAR_URL,
  };
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getScopedKey(key: string, userId?: UserScopeId) {
  const normalizedUserId = userId == null ? '' : String(userId).trim();
  const safeUserId = normalizedUserId.replace(/[^a-zA-Z0-9_-]/g, '_') || USER_SCOPE_KEY;
  return `${key}:${safeUserId}`;
}

function createLocalPostId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function safeSetItem(key: string, value: string): PersistResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown' };
  try {
    window.localStorage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      return { ok: false, reason: 'quota' };
    }
    return { ok: false, reason: 'unknown' };
  }
}

function matchesRemotePath(pathname: string, patternPath: string) {
  if (!patternPath || patternPath === '/**') return true;
  if (patternPath.endsWith('/**')) {
    const prefix = patternPath.slice(0, -3);
    return pathname.startsWith(prefix);
  }
  return pathname === patternPath;
}

function isAllowedRemoteAvatarUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return imageRemotePatterns.some((pattern) => {
      const protocol = `${pattern.protocol}:`;
      return parsed.protocol === protocol
        && parsed.hostname === pattern.hostname
        && matchesRemotePath(parsed.pathname, pattern.pathname || '/**');
    });
  } catch {
    return false;
  }
}

export function normalizeAvatarUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) return DEFAULT_AVATAR_URL;
  if (value.startsWith('/')) return value;
  if (value.startsWith('data:image/')) return value;

  return isAllowedRemoteAvatarUrl(value) ? value : DEFAULT_AVATAR_URL;
}

export function isValidAvatarUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) return true;
  return normalizeAvatarUrl(value) === value;
}

function getFollowingMap(userId?: UserScopeId): FollowingMap {
  if (typeof window === 'undefined') return {};
  return safeParse<FollowingMap>(window.localStorage.getItem(getScopedKey(FOLLOWING_KEY, userId)), {});
}

function saveFollowingMap(map: FollowingMap, userId?: UserScopeId): PersistResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown' };
  return safeSetItem(getScopedKey(FOLLOWING_KEY, userId), JSON.stringify(map));
}

function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function isFollowingHandle(handle: string, fallback: boolean, userId?: UserScopeId) {
  const normalized = normalizeHandle(handle);
  if (!normalized) return fallback;
  const map = getFollowingMap(userId);
  if (typeof map[normalized] === 'boolean') return map[normalized];
  return fallback;
}

export function toggleFollowHandle(handle: string, fallback: boolean, userId?: UserScopeId) {
  const normalized = normalizeHandle(handle);
  if (!normalized) {
    return { ok: false as const, reason: 'unknown' as const, isFollowed: fallback };
  }
  const map = getFollowingMap(userId);
  const current = typeof map[normalized] === 'boolean' ? map[normalized] : fallback;
  const next = !current;
  map[normalized] = next;
  const persist = saveFollowingMap(map, userId);
  return {
    ...persist,
    isFollowed: next,
  };
}


export async function toggleFollowUser(followerId: UserScopeId, followeeId: UserScopeId) {
  const normalizedFollowerId = Number(followerId);
  const normalizedFolloweeId = Number(followeeId);
  if (!Number.isFinite(normalizedFollowerId) || !Number.isFinite(normalizedFolloweeId) || normalizedFollowerId <= 0 || normalizedFolloweeId <= 0) {
    return { ok: false as const, reason: 'unknown' as const, isFollowed: false, followers: 0 };
  }

  const res = await apiFetch<{ isFollowed: boolean; followers: number }>(`/api/social/follows`, {
    method: 'POST',
    body: JSON.stringify({ followerId: normalizedFollowerId, followeeId: normalizedFolloweeId }),
  });

  if (!res.ok) {
    return { ok: false as const, reason: 'unknown' as const, isFollowed: false, followers: 0 };
  }

  return { ok: true as const, isFollowed: Boolean(res.data.isFollowed), followers: Number(res.data.followers || 0) };
}

export function getPostInteractionSummary(post: SocialPost) {
  return {
    liked: Boolean(post.viewerLiked),
    reposted: Boolean(post.viewerReposted),
    commentsList: post.commentsList || [],
    likes: Number(post.likes || 0),
    reposts: Number(post.reposts || 0),
    comments: Number(post.comments || 0),
  };
}

export async function togglePostLike(post: SocialPost, userId?: UserScopeId) {
  const res = await apiFetch<{ liked: boolean; likes: number }>('/api/social/posts/like', {
    method: 'POST',
    body: JSON.stringify({ postId: post.id, userId: userId == null ? null : String(userId) }),
  });
  if (!res.ok) return { ok: false as const, reason: 'unknown' as const, liked: Boolean(post.viewerLiked), likes: post.likes };
  return { ok: true as const, liked: res.data.liked, likes: res.data.likes };
}

export async function togglePostRepost(post: SocialPost, userId?: UserScopeId) {
  const res = await apiFetch<{ reposted: boolean; reposts: number }>('/api/social/posts/repost', {
    method: 'POST',
    body: JSON.stringify({ postId: post.id, userId: userId == null ? null : String(userId) }),
  });
  if (!res.ok) return { ok: false as const, reason: 'unknown' as const, reposted: Boolean(post.viewerReposted), reposts: post.reposts };
  return { ok: true as const, reposted: res.data.reposted, reposts: res.data.reposts };
}

export async function addPostComment(post: SocialPost, content: string, profile: SocialProfile, userId?: UserScopeId) {
  if (!content.trim()) return { ok: false as const, reason: 'unknown' as const };
  const res = await apiFetch<{ comment: SocialComment; comments: number; commentsList: SocialComment[] }>('/api/social/posts/comment', {
    method: 'POST',
    body: JSON.stringify({ postId: post.id, userId: userId == null ? null : String(userId), content: content.trim(), profile }),
  });
  if (!res.ok) return { ok: false as const, reason: 'unknown' as const };
  return { ok: true as const, ...res.data };
}

export function validatePostImage(file?: File | null) {
  if (!file) return { ok: true as const };
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return { ok: false as const, reason: 'file-too-large' as const };
  }
  return { ok: true as const };
}

export function getPostWordLimit() {
  if (typeof window === 'undefined') return 1000;
  const raw = window.localStorage.getItem(WORD_LIMIT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

export function getProfile(userId?: UserScopeId, seed?: ProfileSeed): SocialProfile {
  const fallbackProfile = buildDefaultProfile(userId, seed);
  if (typeof window === 'undefined') return fallbackProfile;
  const stored = safeParse<SocialProfile | null>(window.localStorage.getItem(getScopedKey(PROFILE_KEY, userId)), null);
  return stored ? { ...fallbackProfile, ...stored, avatarUrl: normalizeAvatarUrl(stored.avatarUrl || '') } : fallbackProfile;
}

export async function fetchProfile(userId?: UserScopeId, seed?: ProfileSeed) {
  const fallbackProfile = getProfile(userId, seed);
  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
    return { ok: true as const, profile: fallbackProfile, source: 'local' as const };
  }

  const res = await apiFetch<{ profile?: Partial<SocialProfile> | null }>(`/api/social/profile?userId=${encodeURIComponent(String(normalizedUserId))}`);
  if (!res.ok) {
    return { ok: false as const, profile: fallbackProfile, source: 'local' as const };
  }

  const remoteProfile = res.data?.profile;
  if (!remoteProfile) {
    return { ok: true as const, profile: fallbackProfile, source: 'local' as const };
  }

  const normalizedProfile: SocialProfile = {
    publicName: String(remoteProfile.publicName || fallbackProfile.publicName).trim() || fallbackProfile.publicName,
    handle: String(remoteProfile.handle || fallbackProfile.handle).trim() || fallbackProfile.handle,
    bio: String(remoteProfile.bio || ''),
    avatarUrl: normalizeAvatarUrl(String(remoteProfile.avatarUrl || fallbackProfile.avatarUrl)),
  };

  saveProfile(normalizedProfile, normalizedUserId);
  return { ok: true as const, profile: normalizedProfile, source: 'remote' as const };
}

export function saveProfile(profile: SocialProfile, userId?: UserScopeId): PersistResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown' };
  const sanitizedProfile = { ...profile, avatarUrl: normalizeAvatarUrl(profile.avatarUrl) };
  return safeSetItem(getScopedKey(PROFILE_KEY, userId), JSON.stringify(sanitizedProfile));
}

export async function saveProfileRemote(profile: SocialProfile, userId?: UserScopeId) {
  const normalizedUserId = Number(userId);
  const normalizedProfile = { ...profile, avatarUrl: normalizeAvatarUrl(profile.avatarUrl) };
  const localPersist = saveProfile(normalizedProfile, userId);

  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
    return { ok: localPersist.ok, profile: normalizedProfile, source: 'local-only' as const, reason: localPersist.reason };
  }

  const res = await apiFetch<{ profile?: SocialProfile }>('/api/social/profile', {
    method: 'POST',
    body: JSON.stringify({ userId: normalizedUserId, profile: normalizedProfile }),
  });

  if (!res.ok) {
    return { ok: false as const, profile: normalizedProfile, source: 'local-only' as const, reason: 'unknown' as const };
  }

  const savedProfile: SocialProfile = {
    publicName: String(res.data?.profile?.publicName || normalizedProfile.publicName),
    handle: String(res.data?.profile?.handle || normalizedProfile.handle),
    bio: String(res.data?.profile?.bio || normalizedProfile.bio),
    avatarUrl: normalizeAvatarUrl(String(res.data?.profile?.avatarUrl || normalizedProfile.avatarUrl)),
  };
  saveProfile(savedProfile, normalizedUserId);
  return { ok: true as const, profile: savedProfile, source: 'remote' as const };
}

function getViewBucket() {
  if (typeof window === 'undefined') return {} as Record<string, number>;
  return safeParse<Record<string, number>>(window.localStorage.getItem(VIEW_BUCKET_KEY), {});
}

export async function fetchAllPosts(userId?: UserScopeId): Promise<SocialPost[]> {
  const params = new URLSearchParams();
  if (userId != null) params.set('viewerId', String(userId));
  const res = await apiFetch<{ posts: SocialPost[] }>(`/api/social/posts?${params.toString()}`);
  if (!res.ok || !res.data?.posts) return [];
  const followingMap = getFollowingMap(userId);
  const viewBucket = getViewBucket();
  return res.data.posts.map((post) => {
    const normalized = normalizeHandle(post.handle);
    const isFollowed = typeof followingMap[normalized] === 'boolean' ? followingMap[normalized] : Boolean(post.isFollowed);
    return { ...post, isFollowed, views: Number(post.views || 0) + Number(viewBucket[post.id] || 0) };
  });
}

export function getAllPosts() {
  return [] as SocialPost[];
}

function estimateTrustSignal(post: SocialPost) {
  const followers = post.authorFollowers || 0;
  if (!followers) return 0;
  return Math.log10(followers + 1);
}

function buildScoreFromSummary(post: SocialPost, settings: FeedAlgorithmSettings, interaction: ReturnType<typeof getPostInteractionSummary>) {
  const threadScore = interaction.commentsList.length;
  return (
    interaction.likes * settings.likeWeight
    + interaction.comments * settings.commentWeight
    + interaction.reposts * settings.repostWeight
    + Number(post.views || 0) * settings.viewWeight
    + estimateTrustSignal(post) * settings.trustWeight
    + threadScore * settings.threadBoostWeight
    + (post.isPremium ? settings.premiumBoostWeight : 0)
  );
}

export function getForYouFeed(posts: SocialPost[], options?: { settings?: Partial<FeedAlgorithmSettings> | null }) {
  const settings = normalizeFeedAlgorithmSettings(options?.settings ?? DEFAULT_FEED_ALGORITHM_SETTINGS);
  const followed = posts.filter((post) => post.isFollowed);
  const discover = posts.filter((post) => !post.isFollowed);
  const scoreByPostId = new Map<string, number>();

  posts.forEach((post) => {
    const summary = getPostInteractionSummary(post);
    scoreByPostId.set(post.id, buildScoreFromSummary(post, settings, summary));
  });

  const sortFn = (a: SocialPost, b: SocialPost) =>
    (scoreByPostId.get(b.id) ?? 0) - (scoreByPostId.get(a.id) ?? 0)
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  const max = settings.maxFeedItems;

  const buildMixedPool = (sourcePosts: SocialPost[]) => {
    const premiumPosts = sourcePosts.filter((post) => post.isPremium);
    const regularPosts = sourcePosts.filter((post) => !post.isPremium);
    const premiumSorted = [...premiumPosts].sort(sortFn);
    const regularSorted = [...regularPosts].sort(sortFn);
    const mixed: SocialPost[] = [];
    const target = Math.min(sourcePosts.length, max);
    const premiumTarget = Math.round(target * (settings.premiumContentRatio / 100));
    mixed.push(...premiumSorted.slice(0, premiumTarget));
    mixed.push(...regularSorted.slice(0, target - mixed.length));
    if (mixed.length < target) {
      const leftovers = [...premiumSorted.slice(premiumTarget), ...regularSorted.slice(target - premiumTarget)];
      leftovers
        .sort(sortFn)
        .forEach((post) => {
          if (mixed.length < target && !mixed.find((item) => item.id === post.id)) {
            mixed.push(post);
          }
        });
    }
    return mixed;
  };

  const followedSorted = buildMixedPool(followed);
  const discoverSorted = buildMixedPool(discover);

  const feed: SocialPost[] = [];
  const followingTarget = Math.round(max * (settings.followingRatio / 100));
  feed.push(...followedSorted.slice(0, followingTarget));
  feed.push(...discoverSorted.slice(0, max - feed.length));
  if (feed.length < max) {
    const leftovers = [...followedSorted.slice(followingTarget), ...discoverSorted.slice(max - followingTarget)];
    leftovers
      .sort(sortFn)
      .forEach((post) => {
        if (feed.length < max && !feed.find((item) => item.id === post.id)) {
          feed.push(post);
        }
      });
  }
  return feed;
}

export function getForYouFeedPage(
  posts: SocialPost[],
  options?: {
    settings?: Partial<FeedAlgorithmSettings> | null;
    limit?: number;
    offset?: number;
  },
) {
  const full = getForYouFeed(posts, options);
  const offset = Math.max(0, Math.floor(options?.offset || 0));
  const limit = Math.max(1, Math.floor(options?.limit || full.length));
  const items = full.slice(offset, offset + limit);
  return {
    items,
    hasMore: offset + items.length < full.length,
    nextOffset: offset + items.length,
    total: full.length,
  };
}

export function getFollowingFeed(posts: SocialPost[]) {
  return [...posts]
    .filter((post) => post.isFollowed)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createPost({
  content,
  imageUrl,
  profile,
  isPremium,
}: {
  content: string;
  imageUrl?: string | null;
  profile: SocialProfile;
  isPremium?: boolean;
}): SocialPost {
  return {
    id: createLocalPostId(),
    authorName: profile.publicName,
    handle: profile.handle,
    profileId: profile.handle.replace('@', ''),
    content,
    createdAt: new Date().toISOString(),
    avatarUrl: profile.avatarUrl,
    imageUrl: imageUrl || null,
    likes: 0,
    comments: 0,
    reposts: 0,
    views: 0,
    authorFollowers: 15,
    isFollowed: true,
    isPremium: Boolean(isPremium),
    viewerLiked: false,
    viewerReposted: false,
    commentsList: [],
  };
}

export async function savePost(post: SocialPost, userId?: UserScopeId): Promise<PersistResult> {
  const res = await apiFetch('/api/social/posts', {
    method: 'POST',
    body: JSON.stringify({
      userId: userId == null ? null : String(userId),
      content: post.content,
      imageUrl: post.imageUrl || null,
      isPremium: Boolean(post.isPremium),
      profile: {
        publicName: post.authorName,
        handle: post.handle,
        avatarUrl: post.avatarUrl || DEFAULT_AVATAR_URL,
      },
    }),
  });

  if (!res.ok) return { ok: false, reason: 'unknown' };
  return { ok: true };
}
