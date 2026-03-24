CREATE TABLE IF NOT EXISTS user_activity_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(96) NOT NULL,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  event_type ENUM('login','signup','page_view','heartbeat') NOT NULL,
  auth_method ENUM('email','google','unknown') DEFAULT NULL,
  page_path VARCHAR(255) DEFAULT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uae_occurred (occurred_at),
  INDEX idx_uae_event_day (event_type, occurred_at),
  INDEX idx_uae_auth_day (auth_method, occurred_at),
  INDEX idx_uae_page_day (page_path, occurred_at),
  INDEX idx_uae_user_day (user_id, occurred_at),
  INDEX idx_uae_session_day (session_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_presence (
  session_id VARCHAR(96) PRIMARY KEY,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  current_path VARCHAR(255) DEFAULT NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_presence_last_seen (last_seen_at),
  INDEX idx_presence_user_last_seen (user_id, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
