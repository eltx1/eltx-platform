-- Re-enable spot market orders globally (admin can still disable per market later)
UPDATE spot_markets
   SET allow_market_orders = 1,
       updated_at = NOW()
 WHERE active = 1
   AND COALESCE(allow_market_orders, 0) = 0;
