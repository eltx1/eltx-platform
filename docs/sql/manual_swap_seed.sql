-- سكربت تهيئة يدوي لتحديد اسعار ELTX وتجهيز رصيد مستخدم للتجارب.
-- حدّث قيم الكونفيج تحت قبل التنفيذ، وبعدها نفّذ الاوامر في MySQL.

-- ########## CONFIG ##########
-- البريد اللي هتشتغل عليه في القاعدة.
SET @user_email := 'tester@eltx.io';

-- اسعار ELTX مقابل باقي الاصول (كام ELTX مقابل 1 وحدة من الاصل).
SET @price_eltx_per_eltx := 1.000000000000000000;   -- 1 ELTX مقابل 1 ELTX (ثابت)
SET @price_eltx_per_usdt := 0.000100000000000000;   -- مثال: 1 USDT = ‎0.0001‎ ELTX
SET @price_eltx_per_usdc := 0.000100000000000000;   -- مثال: 1 USDC = ‎0.0001‎ ELTX
SET @price_eltx_per_bnb  := 0.030000000000000000;   -- عدّل حسب احتياجك
SET @price_eltx_per_eth  := 0.065000000000000000;   -- عدّل حسب احتياجك

-- الحدود الدنيا والعليا لكل اصل (سيبها NULL لو مش محتاج).
SET @min_amount_usd := 1.000000000000000000;        -- 1$ حد ادنى للسواب
SET @min_amount_bnb := 0.010000000000000000;
SET @min_amount_eth := 0.005000000000000000;

-- سبريد السعر بالنقط (basis points = 1/100 من %).
SET @spread_bps_usd := 10;                           -- 0.10%
SET @spread_bps_bn_eth := 25;                        -- 0.25%

-- ارصدة المستخدم اللي عايز تجهزها (wei = ‎10^18‎).
SET @balance_eltx := 50000000000000000000000;        -- 50,000 ELTX
SET @balance_usdt := 2500000000000000000000;         -- 2,500 USDT
SET @balance_usdc := 1500000000000000000000;         -- 1,500 USDC
SET @balance_bnb  := 100000000000000000000;          -- 100 BNB
SET @balance_eth  := 50000000000000000000;           -- 50 ETH

-- احتياطي مجمع السواب (wei). عدّل الارقام دي لو عايز تربط السيولة مع السعر.
SET @pool_usdt_eltx_reserve := 100000000000000000000000; -- 100,000 ELTX في مجمع USDT
SET @pool_usdt_asset_decimals := 18;
SET @pool_usdc_eltx_reserve := 50000000000000000000000;  -- 50,000 ELTX في مجمع USDC
SET @pool_usdc_asset_decimals := 18;
SET @pool_bnb_eltx_reserve  := 3000000000000000000000;   -- 3,000 ELTX في مجمع BNB
SET @pool_bnb_asset_decimals := 18;
SET @pool_eth_eltx_reserve  := 4000000000000000000000;   -- 4,000 ELTX في مجمع ETH
SET @pool_eth_asset_decimals := 18;
-- ########## END CONFIG ##########

-- بُرُسيدجر مساعده علشان نحسب رصيد الاصل بناءً على احتياطي ELTX والسعر اللي فوق.
DROP PROCEDURE IF EXISTS ensure_swap_pool;
DELIMITER $$
CREATE PROCEDURE ensure_swap_pool (
  IN p_asset VARCHAR(16),
  IN p_asset_decimals INT,
  IN p_eltx_reserve DECIMAL(65,0),
  IN p_price_eltx DECIMAL(36,18)
)
proc: BEGIN
  DECLARE v_asset_reserve DECIMAL(65,0);

  IF p_price_eltx <= 0 OR p_eltx_reserve IS NULL OR p_eltx_reserve = 0 THEN
    LEAVE proc;
  END IF;

  SET v_asset_reserve := CAST(p_eltx_reserve / p_price_eltx AS DECIMAL(65,0));

  INSERT INTO swap_liquidity_pools (asset, asset_decimals, asset_reserve_wei, eltx_reserve_wei)
  VALUES (p_asset, p_asset_decimals, v_asset_reserve, p_eltx_reserve)
  ON DUPLICATE KEY UPDATE
    asset_decimals = VALUES(asset_decimals),
    asset_reserve_wei = VALUES(asset_reserve_wei),
    eltx_reserve_wei = VALUES(eltx_reserve_wei);
END proc$$
DELIMITER ;

START TRANSACTION;

-- 1) حدّد اسعار ELTX مقابل باقي الاصول المستخدمة في اختبار السواب.
--    price_eltx يعني كام ELTX يكافئ وحدة واحدة من الاصل التاني.
REPLACE INTO asset_prices (asset, price_eltx, min_amount, max_amount, spread_bps)
VALUES
  ('ELTX', @price_eltx_per_eltx, 0.000000000000000000, NULL, 0),
  ('USDT', @price_eltx_per_usdt, @min_amount_usd, NULL, @spread_bps_usd),
  ('USDC', @price_eltx_per_usdc, @min_amount_usd, NULL, @spread_bps_usd),
  ('BNB', @price_eltx_per_bnb, @min_amount_bnb, NULL, @spread_bps_bn_eth),
  ('ETH', @price_eltx_per_eth, @min_amount_eth, NULL, @spread_bps_bn_eth);

SELECT id INTO @user_id FROM users WHERE email = @user_email LIMIT 1;

-- اتأكد ان المستخدم موجود قبل ما تكمل.
SELECT @user_id AS user_id; -- لو النتيجة NULL يبقى لازم تضيف المستخدم الاول.

-- 3) (اختياري) لو عايز تفضي الارصدة القديمة قبل التعبئة، نفّذ الامر ده.
--    سيبه متعلّق لو عايز تحتفظ بالرصد السابق.
-- DELETE FROM user_balances WHERE user_id = @user_id AND asset IN ('ELTX','USDT','USDC','BNB','ETH');

-- 4) عبّي الرصيد الجديد للمستخدم بنفس الوحدات (wei = 10^18).
INSERT INTO user_balances (user_id, asset, balance_wei)
VALUES
  (@user_id, 'ELTX', @balance_eltx),
  (@user_id, 'USDT', @balance_usdt),
  (@user_id, 'USDC', @balance_usdc),
  (@user_id, 'BNB', @balance_bnb),
  (@user_id, 'ETH', @balance_eth)
ON DUPLICATE KEY UPDATE
  balance_wei = VALUES(balance_wei);

-- 5) (اختياري) علشان تربط سعر السواب مع المعروض والسيولة الداخلية، عدّل احتياطيات
--    swap_liquidity_pools بناءً على نفس السعر اللي سجلته في asset_prices. كرّر
--    البلوك ده لكل اصل انت محتاجه، مع ضبط الديسيمل الخاص بكل عملة وتغيير
--    المتغيرات قبل ما تعيد التنفيذ.
--    - *_eltx_reserve: كمية ELTX اللي عايزها جوه المجمع (بوحدة wei = ‎10^18‎).
--    السكريبت بيحسب تلقائيًا الكمية المطلوبة من الاصل التاني حسب السعر اللي فوق.
CALL ensure_swap_pool('USDT', @pool_usdt_asset_decimals, @pool_usdt_eltx_reserve, @price_eltx_per_usdt);
CALL ensure_swap_pool('USDC', @pool_usdc_asset_decimals, @pool_usdc_eltx_reserve, @price_eltx_per_usdc);
CALL ensure_swap_pool('BNB',  @pool_bnb_asset_decimals,  @pool_bnb_eltx_reserve,  @price_eltx_per_bnb);
CALL ensure_swap_pool('ETH',  @pool_eth_asset_decimals,  @pool_eth_eltx_reserve,  @price_eltx_per_eth);

COMMIT;

DROP PROCEDURE IF EXISTS ensure_swap_pool;

-- بعد التنفيذ، تأكد ان البيانات اتحدّثت بالقيم اللي انت محددها.
SELECT asset, price_eltx, min_amount, max_amount, spread_bps
FROM asset_prices
WHERE asset IN ('ELTX','USDT','USDC','BNB','ETH');

SELECT asset, balance_wei
FROM user_balances
WHERE user_id = @user_id;

SELECT asset, asset_reserve_wei, eltx_reserve_wei
FROM swap_liquidity_pools
WHERE asset IN ('USDT','USDC','BNB','ETH');
