INSERT INTO platform_settings (name, value)
VALUES (
  'seo_settings_json',
  '{"sitemapRefreshHours":3,"indexNowEnabled":false,"indexNowKey":"","indexNowKeyLocation":"/indexnow-key.txt","includeRssInSitemap":true,"postPublishPingEnabled":false,"postPublishPingUrls":["https://rpc.pingomatic.com/"]}'
)
ON DUPLICATE KEY UPDATE
  value = CASE
    WHEN value IS NULL OR TRIM(value) = '' THEN VALUES(value)
    WHEN value LIKE '%"postPublishPingEnabled"%' AND value LIKE '%"postPublishPingUrls"%' THEN value
    WHEN RIGHT(TRIM(value), 1) = '}' THEN CONCAT(
      LEFT(TRIM(value), CHAR_LENGTH(TRIM(value)) - 1),
      CASE
        WHEN value LIKE '%"postPublishPingEnabled"%' THEN ''
        ELSE ',"postPublishPingEnabled":false'
      END,
      CASE
        WHEN value LIKE '%"postPublishPingUrls"%' THEN ''
        ELSE ',"postPublishPingUrls":["https://rpc.pingomatic.com/"]'
      END,
      '}'
    )
    ELSE value
  END;
