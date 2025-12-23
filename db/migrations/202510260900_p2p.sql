-- P2P marketplace schema

CREATE TABLE IF NOT EXISTS p2p_payment_methods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NULL,
  country VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  dispute_delay_hours INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_p2p_payment_method_code (code),
  INDEX idx_p2p_payment_method_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  side ENUM('buy','sell') NOT NULL,
  asset VARCHAR(8) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  price DECIMAL(18,6) NOT NULL,
  min_limit DECIMAL(18,2) NOT NULL,
  max_limit DECIMAL(18,2) NOT NULL,
  total_amount DECIMAL(36,18) NOT NULL,
  available_amount DECIMAL(36,18) NOT NULL,
  status ENUM('active','paused','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_p2p_offers_user (user_id),
  INDEX idx_p2p_offers_asset_side (asset, side),
  INDEX idx_p2p_offers_status (status),
  CONSTRAINT fk_p2p_offers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_offer_payment_methods (
  offer_id BIGINT UNSIGNED NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (offer_id, payment_method_id),
  INDEX idx_p2p_offer_payment_method (payment_method_id),
  CONSTRAINT fk_p2p_offer_payment_offer FOREIGN KEY (offer_id) REFERENCES p2p_offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_offer_payment_method FOREIGN KEY (payment_method_id) REFERENCES p2p_payment_methods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_trades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  offer_id BIGINT UNSIGNED NOT NULL,
  buyer_id INT NOT NULL,
  seller_id INT NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  asset VARCHAR(8) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  price DECIMAL(18,6) NOT NULL,
  amount DECIMAL(36,18) NOT NULL,
  fiat_amount DECIMAL(18,2) NOT NULL,
  status ENUM('initiated','payment_pending','paid','released','completed','disputed') NOT NULL DEFAULT 'initiated',
  escrow_amount_wei DECIMAL(65,0) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  released_at DATETIME NULL,
  completed_at DATETIME NULL,
  disputed_at DATETIME NULL,
  INDEX idx_p2p_trades_buyer (buyer_id),
  INDEX idx_p2p_trades_seller (seller_id),
  INDEX idx_p2p_trades_status (status),
  INDEX idx_p2p_trades_offer (offer_id),
  CONSTRAINT fk_p2p_trades_offer FOREIGN KEY (offer_id) REFERENCES p2p_offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_trades_payment_method FOREIGN KEY (payment_method_id) REFERENCES p2p_payment_methods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_p2p_trades_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_trades_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_escrows (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trade_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  asset VARCHAR(8) NOT NULL,
  amount_wei DECIMAL(65,0) NOT NULL,
  status ENUM('locked','released','refunded') NOT NULL DEFAULT 'locked',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_p2p_escrows_trade (trade_id),
  CONSTRAINT fk_p2p_escrows_trade FOREIGN KEY (trade_id) REFERENCES p2p_trades(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_escrows_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trade_id BIGINT UNSIGNED NOT NULL,
  sender_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_p2p_messages_trade (trade_id),
  CONSTRAINT fk_p2p_messages_trade FOREIGN KEY (trade_id) REFERENCES p2p_trades(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_disputes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trade_id BIGINT UNSIGNED NOT NULL,
  opened_by INT NOT NULL,
  status ENUM('open','resolved','closed') NOT NULL DEFAULT 'open',
  reason VARCHAR(255) NOT NULL,
  evidence TEXT NULL,
  resolution ENUM('buyer','seller','cancel') NULL,
  admin_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  INDEX idx_p2p_disputes_trade (trade_id),
  INDEX idx_p2p_disputes_status (status),
  CONSTRAINT fk_p2p_disputes_trade FOREIGN KEY (trade_id) REFERENCES p2p_trades(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_disputes_user FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_p2p_disputes_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
