-- Social profiles
CREATE TABLE IF NOT EXISTS social_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  public_name VARCHAR(120) NOT NULL,
  handle VARCHAR(64) NOT NULL,
  bio VARCHAR(500) DEFAULT NULL,
  avatar_url VARCHAR(512) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_social_profiles_user (user_id),
  UNIQUE KEY uniq_social_profiles_handle (handle),
  INDEX idx_social_profiles_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Social posts
CREATE TABLE IF NOT EXISTS social_posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  image_url VARCHAR(512) DEFAULT NULL,
  word_count INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_posts_user (user_id),
  INDEX idx_social_posts_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Likes
CREATE TABLE IF NOT EXISTS social_post_likes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_social_post_like (post_id, user_id),
  INDEX idx_social_post_likes_post (post_id),
  INDEX idx_social_post_likes_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments
CREATE TABLE IF NOT EXISTS social_post_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_social_post_comments_post (post_id),
  INDEX idx_social_post_comments_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reposts
CREATE TABLE IF NOT EXISTS social_post_reposts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_social_post_repost (post_id, user_id),
  INDEX idx_social_post_reposts_post (post_id),
  INDEX idx_social_post_reposts_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Followers
CREATE TABLE IF NOT EXISTS social_follows (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  follower_id BIGINT UNSIGNED NOT NULL,
  followee_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_social_follow (follower_id, followee_id),
  INDEX idx_social_follow_follower (follower_id),
  INDEX idx_social_follow_followee (followee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: default post length setting (if platform_settings exists)
INSERT INTO platform_settings (name, value)
VALUES ('social_post_word_limit', '1000')
ON DUPLICATE KEY UPDATE value = VALUES(value);
