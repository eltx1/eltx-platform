'use client';

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
  isFollowed?: boolean;
};

export type SocialProfile = {
  publicName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
};

const POSTS_KEY = 'lordai.social.posts';
const PROFILE_KEY = 'lordai.social.profile';
const WORD_LIMIT_KEY = 'lordai.social.postWordLimit';

const defaultProfile: SocialProfile = {
  publicName: 'LordAI Creator',
  handle: '@lordai_creator',
  bio: 'Building, trading, and sharing on LordAi.Net.',
  avatarUrl: '/assets/img/logo.jpeg',
};

const seedPosts: SocialPost[] = [
  {
    id: 'seed-1',
    authorName: 'Lina Hassan',
    handle: '@lina.web3',
    profileId: 'lina',
    content: 'Shipped a new tutorial on Web3 onboarding today. Sharing the key takeaways soon.',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    avatarUrl: '/assets/img/logo.jpeg',
    likes: 128,
    comments: 24,
    reposts: 18,
    isFollowed: true,
  },
  {
    id: 'seed-2',
    authorName: 'Omar Yusuf',
    handle: '@omaryusuf',
    profileId: 'omar',
    content: 'Testing the LordAI feed — love how fast the media preview loads.',
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    avatarUrl: '/assets/img/logo.jpeg',
    imageUrl: '/assets/img/logo.jpeg',
    likes: 86,
    comments: 12,
    reposts: 7,
    isFollowed: false,
  },
  {
    id: 'seed-3',
    authorName: 'Ava Reed',
    handle: '@ava.trade',
    profileId: 'ava',
    content: 'USDT balance synced up top while I trade. Feels clean.',
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    avatarUrl: '/assets/img/logo.jpeg',
    likes: 42,
    comments: 8,
    reposts: 4,
    isFollowed: true,
  },
  {
    id: 'seed-4',
    authorName: 'Yara Ali',
    handle: '@yara.ai',
    profileId: 'yara',
    content: 'جربت Ask LordAI ورد بسرعة جدًا. محتوى الذكاء الاصطناعي هيكون ترند هنا.',
    createdAt: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
    avatarUrl: '/assets/img/logo.jpeg',
    likes: 210,
    comments: 31,
    reposts: 26,
    isFollowed: false,
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

export function getPostWordLimit() {
  if (typeof window === 'undefined') return 1000;
  const raw = window.localStorage.getItem(WORD_LIMIT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

export function getProfile(): SocialProfile {
  if (typeof window === 'undefined') return defaultProfile;
  const stored = safeParse<SocialProfile | null>(window.localStorage.getItem(PROFILE_KEY), null);
  return stored ? { ...defaultProfile, ...stored } : defaultProfile;
}

export function saveProfile(profile: SocialProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getStoredPosts(): SocialPost[] {
  if (typeof window === 'undefined') return [];
  return safeParse<SocialPost[]>(window.localStorage.getItem(POSTS_KEY), []);
}

export function savePost(post: SocialPost) {
  if (typeof window === 'undefined') return;
  const posts = getStoredPosts();
  window.localStorage.setItem(POSTS_KEY, JSON.stringify([post, ...posts]));
}

export function getAllPosts(): SocialPost[] {
  const stored = getStoredPosts();
  const all = [...stored, ...seedPosts];
  const byId = new Map<string, SocialPost>();
  all.forEach((post) => {
    if (!byId.has(post.id)) byId.set(post.id, post);
  });
  return Array.from(byId.values());
}

export function getForYouFeed(posts: SocialPost[]) {
  const followed = posts.filter((post) => post.isFollowed);
  const discover = posts.filter((post) => !post.isFollowed);
  const score = (post: SocialPost) => post.likes * 2 + post.comments * 3 + post.reposts * 4;
  const sortFn = (a: SocialPost, b: SocialPost) =>
    score(b) - score(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const followedSorted = [...followed].sort(sortFn);
  const discoverSorted = [...discover].sort(sortFn);
  const feed: SocialPost[] = [];
  const max = 30;
  const half = Math.ceil(max / 2);
  feed.push(...followedSorted.slice(0, half));
  feed.push(...discoverSorted.slice(0, max - feed.length));
  return feed;
}

export function createPost({
  content,
  imageUrl,
  profile,
}: {
  content: string;
  imageUrl?: string | null;
  profile: SocialProfile;
}): SocialPost {
  return {
    id: `local-${Date.now()}`,
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
    isFollowed: true,
  };
}
