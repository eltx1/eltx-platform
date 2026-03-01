export type FeedAlgorithmSettings = {
  followingRatio: number;
  forYouRatio: number;
  likeWeight: number;
  commentWeight: number;
  repostWeight: number;
  viewWeight: number;
  trustWeight: number;
  threadBoostWeight: number;
  maxFeedItems: number;
};

export const DEFAULT_FEED_ALGORITHM_SETTINGS: FeedAlgorithmSettings = {
  followingRatio: 50,
  forYouRatio: 50,
  likeWeight: 2,
  commentWeight: 4,
  repostWeight: 5,
  viewWeight: 1,
  trustWeight: 1,
  threadBoostWeight: 3,
  maxFeedItems: 30,
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeFeedAlgorithmSettings(input?: Partial<FeedAlgorithmSettings> | null): FeedAlgorithmSettings {
  const merged: FeedAlgorithmSettings = {
    ...DEFAULT_FEED_ALGORITHM_SETTINGS,
    ...(input || {}),
  };

  const followingRatio = clamp(Math.round(merged.followingRatio), 0, 100);
  const forYouRatio = clamp(Math.round(merged.forYouRatio), 0, 100);
  const ratioTotal = followingRatio + forYouRatio;

  let normalizedFollowing = followingRatio;
  let normalizedForYou = forYouRatio;

  if (ratioTotal === 0) {
    normalizedFollowing = DEFAULT_FEED_ALGORITHM_SETTINGS.followingRatio;
    normalizedForYou = DEFAULT_FEED_ALGORITHM_SETTINGS.forYouRatio;
  } else if (ratioTotal !== 100) {
    normalizedFollowing = Math.round((followingRatio / ratioTotal) * 100);
    normalizedForYou = 100 - normalizedFollowing;
  }

  return {
    followingRatio: normalizedFollowing,
    forYouRatio: normalizedForYou,
    likeWeight: clamp(merged.likeWeight, 0, 20),
    commentWeight: clamp(merged.commentWeight, 0, 20),
    repostWeight: clamp(merged.repostWeight, 0, 20),
    viewWeight: clamp(merged.viewWeight, 0, 20),
    trustWeight: clamp(merged.trustWeight, 0, 20),
    threadBoostWeight: clamp(merged.threadBoostWeight, 0, 20),
    maxFeedItems: clamp(Math.round(merged.maxFeedItems), 5, 100),
  };
}
