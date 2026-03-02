-- Test schema fixture for integration tests (minimum baseline)
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE user_credentials (
  user_id BIGINT PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  expires_at DATETIME NOT NULL
);
