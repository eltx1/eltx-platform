-- Messaging system: requests + inbox + read tracking
-- Note: user reference columns use signed INT to match existing users.id schema in this project.
CREATE TABLE IF NOT EXISTS message_threads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requester_id INT NOT NULL,
  recipient_id INT NOT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  accepted_at DATETIME NULL,
  rejected_at DATETIME NULL,
  last_message_at DATETIME NULL,
  last_message_preview VARCHAR(280) NULL,
  last_message_sender_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_message_thread_pair (requester_id, recipient_id),
  INDEX idx_message_threads_status (status, updated_at),
  INDEX idx_message_threads_requester (requester_id, updated_at),
  INDEX idx_message_threads_recipient (recipient_id, updated_at),
  CONSTRAINT fk_message_threads_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_threads_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_threads_last_sender FOREIGN KEY (last_message_sender_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS message_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id BIGINT UNSIGNED NOT NULL,
  sender_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_message_entries_thread (thread_id, id),
  INDEX idx_message_entries_sender (sender_id, created_at),
  CONSTRAINT fk_message_entries_thread FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_entries_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_thread_reads (
  thread_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  last_read_message_id BIGINT UNSIGNED NULL,
  last_read_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, user_id),
  INDEX idx_message_thread_reads_user (user_id, updated_at),
  CONSTRAINT fk_message_thread_reads_thread FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_thread_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_thread_reads_last_message FOREIGN KEY (last_read_message_id) REFERENCES message_entries(id) ON DELETE SET NULL
);
