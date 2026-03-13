INSERT INTO platform_settings (name, value)
VALUES (
  'seo_settings_json',
  '{"sitemapRefreshHours":3,"indexNowEnabled":false,"indexNowKey":"","indexNowKeyLocation":"/indexnow-key.txt","includeRssInSitemap":true}'
)
ON DUPLICATE KEY UPDATE value = value;
