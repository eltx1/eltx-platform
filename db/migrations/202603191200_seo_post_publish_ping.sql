INSERT INTO platform_settings (name, value)
VALUES (
  'seo_settings_json',
  '{"sitemapRefreshHours":3,"indexNowEnabled":false,"indexNowKey":"","indexNowKeyLocation":"/indexnow-key.txt","includeRssInSitemap":true,"postPublishPingEnabled":false,"postPublishPingUrls":["https://rpc.pingomatic.com/"]}'
)
ON DUPLICATE KEY UPDATE value = value;
