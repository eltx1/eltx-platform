-- Convert defaults: live-first execution and reliable icon URLs

INSERT INTO platform_settings (`name`, `value`)
VALUES ('convert_execution_mode', 'live')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

UPDATE convert_pairs
SET logo_url = CASE UPPER(token_symbol)
  WHEN 'XAUT' THEN 'https://assets.coingecko.com/coins/images/10481/standard/Tether_Gold.png'
  WHEN 'BNB' THEN 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x0000000000000000000000000000000000000000/logo.png'
  WHEN 'WBTC' THEN 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x7130d2A12B9BCBfAe4f2634d864A1Ee1Ce3Ead9c/logo.png'
  WHEN 'SOL' THEN 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png'
  WHEN 'XRP' THEN 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/xrp/info/logo.png'
  WHEN 'NVDA' THEN 'https://logo.clearbit.com/nvidia.com'
  WHEN 'TSLA' THEN 'https://logo.clearbit.com/tesla.com'
  WHEN 'AAPL' THEN 'https://logo.clearbit.com/apple.com'
  WHEN 'MSFT' THEN 'https://logo.clearbit.com/microsoft.com'
  WHEN 'AMZN' THEN 'https://logo.clearbit.com/amazon.com'
  WHEN 'GOOGL' THEN 'https://logo.clearbit.com/google.com'
  ELSE logo_url
END
WHERE active = 1;
