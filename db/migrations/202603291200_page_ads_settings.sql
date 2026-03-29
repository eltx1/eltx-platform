-- Store ad-network HTML snippets per product page for admin-controlled placements.
INSERT INTO platform_settings (name, value)
VALUES (
  'page_ads_settings_json',
  JSON_OBJECT(
    'for_you', '',
    'ai', '',
    'dashboard', '',
    'wallet', '',
    'public_profile', '',
    'public_post', '',
    'market', '',
    'p2p', ''
  )
)
ON DUPLICATE KEY UPDATE value = VALUES(value);
