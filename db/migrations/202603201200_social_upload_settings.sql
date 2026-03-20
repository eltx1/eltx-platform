INSERT INTO platform_settings (name, value)
VALUES (
  'social_upload_settings_json',
  JSON_OBJECT('maxImageUploadMb', 15)
)
ON DUPLICATE KEY UPDATE value = VALUES(value);
