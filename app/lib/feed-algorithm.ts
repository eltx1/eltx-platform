export type FeedAlgorithmSettings = {
  followingRatio: number;
  forYouRatio: number;
  likeWeight: number;
  commentWeight: number;
  repostWeight: number;
  viewWeight: number;
  trustWeight: number;
  threadBoostWeight: number;
  premiumBoostWeight: number;
  premiumContentRatio: number;
  regularContentRatio: number;
  maxFeedItems: number;
  dashboardForYouItems: number;
  forYouPageItems: number;
  topMonthlyItems: number;
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
  premiumBoostWeight: 6,
  premiumContentRatio: 80,
  regularContentRatio: 20,
  maxFeedItems: 30,
  dashboardForYouItems: 30,
  forYouPageItems: 50,
  topMonthlyItems: 10,
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
  const premiumContentRatio = clamp(Math.round(merged.premiumContentRatio), 0, 100);
  const regularContentRatio = clamp(Math.round(merged.regularContentRatio), 0, 100);
  const contentRatioTotal = premiumContentRatio + regularContentRatio;

  let normalizedFollowing = followingRatio;
  let normalizedForYou = forYouRatio;

  if (ratioTotal === 0) {
    normalizedFollowing = DEFAULT_FEED_ALGORITHM_SETTINGS.followingRatio;
    normalizedForYou = DEFAULT_FEED_ALGORITHM_SETTINGS.forYouRatio;
  } else if (ratioTotal !== 100) {
    normalizedFollowing = Math.round((followingRatio / ratioTotal) * 100);
    normalizedForYou = 100 - normalizedFollowing;
  }

  let normalizedPremiumContent = premiumContentRatio;
  let normalizedRegularContent = regularContentRatio;

  if (contentRatioTotal === 0) {
    normalizedPremiumContent = DEFAULT_FEED_ALGORITHM_SETTINGS.premiumContentRatio;
    normalizedRegularContent = DEFAULT_FEED_ALGORITHM_SETTINGS.regularContentRatio;
  } else if (contentRatioTotal !== 100) {
    normalizedPremiumContent = Math.round((premiumContentRatio / contentRatioTotal) * 100);
    normalizedRegularContent = 100 - normalizedPremiumContent;
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
    premiumBoostWeight: clamp(merged.premiumBoostWeight, 0, 50),
    premiumContentRatio: normalizedPremiumContent,
    regularContentRatio: normalizedRegularContent,
    maxFeedItems: clamp(Math.round(merged.maxFeedItems), 5, 100),
    dashboardForYouItems: clamp(Math.round(merged.dashboardForYouItems), 5, 100),
    forYouPageItems: clamp(Math.round(merged.forYouPageItems), 10, 200),
    topMonthlyItems: clamp(Math.round(merged.topMonthlyItems), 3, 50),
  };
}
