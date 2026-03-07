'use client';

import { imageRemotePatterns } from './image-remote-patterns.mjs';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, normalizeFeedAlgorithmSettings, type FeedAlgorithmSettings } from './feed-algorithm';

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

const POSTS_KEY = 'lordai.social.posts';
const PROFILE_KEY = 'lordai.social.profile';
const WORD_LIMIT_KEY = 'lordai.social.postWordLimit';
const INTERACTIONS_KEY = 'lordai.social.interactions';
const FOLLOWING_KEY = 'lordai.social.following';
const USER_SCOPE_KEY = 'guest';
const MAX_IMAGE_FILE_SIZE_BYTES = 3 * 1024 * 1024;

type PostInteractionState = {
  liked: boolean;
  reposted: boolean;
  comments: SocialComment[];
};

type InteractionMap = Record<string, PostInteractionState>;
type FollowingMap = Record<string, boolean>;

type UserScopeId = string | number | null | undefined;

export type PersistResult = {
  ok: boolean;
  reason?: 'quota' | 'unknown';
};

const defaultProfile: SocialProfile = {
  publicName: 'LordAI Creator',
  handle: '@lordai_creator',
  bio: 'Building, trading, and sharing on LordAi.Net.',
  avatarUrl: '/assets/img/logo-new.svg',
};

const seedPosts: SocialPost[] = [
  {
    id: 'seed-1',
    authorName: 'Lina Hassan',
    handle: '@lina.web3',
    profileId: 'lina',
    content: 'Shipped a new tutorial on Web3 onboarding today. Sharing the key takeaways soon.',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    avatarUrl: '/assets/img/logo-new.svg',
    likes: 128,
    comments: 24,
    reposts: 18,
    views: 2250,
    authorFollowers: 3900,
    isFollowed: true,
    isPremium: true,
  },
  {
    id: 'seed-2',
    authorName: 'Omar Yusuf',
    handle: '@omaryusuf',
    profileId: 'omar',
    content: 'Testing the LordAI feed — love how fast the media preview loads.',
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    avatarUrl: '/assets/img/logo-new.svg',
    imageUrl: '/assets/img/logo-new.svg',
    likes: 86,
    comments: 12,
    reposts: 7,
    views: 980,
    authorFollowers: 1100,
    isFollowed: false,
    isPremium: false,
  },
  {
    id: 'seed-3',
    authorName: 'Ava Reed',
    handle: '@ava.trade',
    profileId: 'ava',
    content: 'USDT balance synced up top while I trade. Feels clean.',
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    avatarUrl: '/assets/img/logo-new.svg',
    likes: 42,
    comments: 8,
    reposts: 4,
    views: 720,
    authorFollowers: 610,
    isFollowed: true,
    isPremium: false,
  },
  {
    id: 'seed-4',
    authorName: 'Yara Ali',
    handle: '@yara.ai',
    profileId: 'yara',
    content: 'جربت Ask LordAI ورد بسرعة جدًا. محتوى الذكاء الاصطناعي هيكون ترند هنا.',
    createdAt: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
    avatarUrl: '/assets/img/logo-new.svg',
    likes: 210,
    comments: 31,
    reposts: 26,
    views: 4120,
    authorFollowers: 5300,
    isFollowed: false,
    isPremium: true,
  },
];

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
  if (!value) return defaultProfile.avatarUrl;
  if (value.startsWith('/')) return value;
  if (value.startsWith('data:image/')) return value;

  return isAllowedRemoteAvatarUrl(value) ? value : defaultProfile.avatarUrl;
}

export function isValidAvatarUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) return true;
  return normalizeAvatarUrl(value) === value;
}

function getInteractions(userId?: UserScopeId): InteractionMap {
  if (typeof window === 'undefined') return {};
  return safeParse<InteractionMap>(window.localStorage.getItem(getScopedKey(INTERACTIONS_KEY, userId)), {});
}

function saveInteractions(map: InteractionMap, userId?: UserScopeId): PersistResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown' };
  return safeSetItem(getScopedKey(INTERACTIONS_KEY, userId), JSON.stringify(map));
}

function getPostState(postId: string, userId?: UserScopeId): PostInteractionState {
  const interactions = getInteractions(userId);
  return interactions[postId] || { liked: false, reposted: false, comments: [] };
}

function getPostStateFromMap(postId: string, interactions: InteractionMap): PostInteractionState {
  return interactions[postId] || { liked: false, reposted: false, comments: [] };
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

function getPostInteractionSummaryFromMap(post: SocialPost, interactions: InteractionMap) {
  const state = getPostStateFromMap(post.id, interactions);
  return {
    liked: state.liked,
    reposted: state.reposted,
    commentsList: state.comments,
    likes: post.likes + (state.liked ? 1 : 0),
    reposts: post.reposts + (state.reposted ? 1 : 0),
    comments: post.comments + state.comments.length,
  };
}

export function getPostInteractionSummary(post: SocialPost, userId?: UserScopeId) {
  const state = getPostState(post.id, userId);
  return {
    liked: state.liked,
    reposted: state.reposted,
    commentsList: state.comments,
    likes: post.likes + (state.liked ? 1 : 0),
    reposts: post.reposts + (state.reposted ? 1 : 0),
    comments: post.comments + state.comments.length,
  };
}

export function togglePostLike(post: SocialPost, userId?: UserScopeId) {
  const interactions = getInteractions(userId);
  const state = interactions[post.id] || { liked: false, reposted: false, comments: [] };
  state.liked = !state.liked;
  interactions[post.id] = state;
  const persist = saveInteractions(interactions, userId);
  return {
    ...persist,
    liked: state.liked,
    likes: post.likes + (state.liked ? 1 : 0),
  };
}

export function togglePostRepost(post: SocialPost, userId?: UserScopeId) {
  const interactions = getInteractions(userId);
  const state = interactions[post.id] || { liked: false, reposted: false, comments: [] };
  state.reposted = !state.reposted;
  interactions[post.id] = state;
  const persist = saveInteractions(interactions, userId);
  return {
    ...persist,
    reposted: state.reposted,
    reposts: post.reposts + (state.reposted ? 1 : 0),
  };
}

export function addPostComment(post: SocialPost, content: string, profile: SocialProfile, userId?: UserScopeId) {
  if (!content.trim()) return { ok: false as const, reason: 'unknown' as const };
  const interactions = getInteractions(userId);
  const state = interactions[post.id] || { liked: false, reposted: false, comments: [] };
  const comment: SocialComment = {
    id: createLocalPostId(),
    postId: post.id,
    authorName: profile.publicName,
    handle: profile.handle,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  state.comments = [comment, ...state.comments];
  interactions[post.id] = state;
  const persist = saveInteractions(interactions, userId);
  return {
    ...persist,
    comment,
    comments: post.comments + state.comments.length,
    commentsList: state.comments,
  };
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

export function getProfile(userId?: UserScopeId): SocialProfile {
  if (typeof window === 'undefined') return defaultProfile;
  const stored = safeParse<SocialProfile | null>(window.localStorage.getItem(getScopedKey(PROFILE_KEY, userId)), null);
  return stored ? { ...defaultProfile, ...stored, avatarUrl: normalizeAvatarUrl(stored.avatarUrl || '') } : defaultProfile;
}

export function saveProfile(profile: SocialProfile, userId?: UserScopeId): PersistResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown' };
  const sanitizedProfile = { ...profile, avatarUrl: normalizeAvatarUrl(profile.avatarUrl) };
  return safeSetItem(getScopedKey(PROFILE_KEY, userId), JSON.stringify(sanitizedProfile));
}

export function getStoredPosts(userId?: UserScopeId): SocialPost[] {
  if (typeof window === 'undefined') return [];
  return safeParse<SocialPost[]>(window.localStorage.getItem(getScopedKey(POSTS_KEY, userId)), []);
}

export function savePost(post: SocialPost, userId?: UserScopeId): PersistResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unknown' };
  const posts = getStoredPosts(userId);
  return safeSetItem(getScopedKey(POSTS_KEY, userId), JSON.stringify([post, ...posts]));
}

export function getAllPosts(userId?: UserScopeId): SocialPost[] {
  const followingMap = getFollowingMap(userId);
  const stored = getStoredPosts(userId);
  const all = [...stored, ...seedPosts];
  const byId = new Map<string, SocialPost>();
  all.forEach((post) => {
    if (!byId.has(post.id)) {
      const normalized = normalizeHandle(post.handle);
      const isFollowed = typeof followingMap[normalized] === 'boolean' ? followingMap[normalized] : Boolean(post.isFollowed);
      byId.set(post.id, { ...post, isFollowed });
    }
  });
  return Array.from(byId.values());
}

function estimateTrustSignal(post: SocialPost) {
  const followers = post.authorFollowers || 0;
  if (!followers) return 0;
  return Math.log10(followers + 1);
}

function buildScoreFromSummary(
  post: SocialPost,
  settings: FeedAlgorithmSettings,
  interaction: ReturnType<typeof getPostInteractionSummaryFromMap>,
) {
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

export function getForYouFeed(posts: SocialPost[], options?: { userId?: UserScopeId; settings?: Partial<FeedAlgorithmSettings> | null }) {
  const settings = normalizeFeedAlgorithmSettings(options?.settings ?? DEFAULT_FEED_ALGORITHM_SETTINGS);
  const followed = posts.filter((post) => post.isFollowed);
  const discover = posts.filter((post) => !post.isFollowed);
  const interactions = getInteractions(options?.userId);
  const scoreByPostId = new Map<string, number>();

  posts.forEach((post) => {
    const summary = getPostInteractionSummaryFromMap(post, interactions);
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
  };
}
