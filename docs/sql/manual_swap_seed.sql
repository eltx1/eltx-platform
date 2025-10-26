-- سكربت تهيئة يدوي لتحديد اسعار السواب وتجهيز رصيد مستخدم للتجارب
-- عدّل القيم بالاسفل قبل التنفيذ حسب احتياجك ثم نفّذ الاوامر في MySQL.

START TRANSACTION;

-- 1) حدّد اسعار ELTX مقابل باقي الاصول المستخدمة في اختبار السواب.
--    price_eltx يعني كام ELTX يكافئ وحدة واحدة من الاصل التاني.
REPLACE INTO asset_prices (asset, price_eltx, min_amount, max_amount, spread_bps)
VALUES
  ('ELTX', 1.000000000000000000, 0.000000000000000000, NULL, 0),
  ('USDT', 12.500000000000000000, 1.000000000000000000, NULL, 10),
  ('USDC', 12.450000000000000000, 1.000000000000000000, NULL, 10),
  ('BNB', 420.000000000000000000, 0.010000000000000000, NULL, 25),
  ('ETH', 7500.000000000000000000, 0.005000000000000000, NULL, 25);

-- 2) هات الـ id الخاص بالمستخدم اللي هتجرب بيه.
--    بدّل البريد في المتغير ده ببريد المستخدم الفعلي عندك.
SET @user_email := 'tester@eltx.io';
SELECT id INTO @user_id FROM users WHERE email = @user_email LIMIT 1;

-- اتأكد ان المستخدم موجود قبل ما تكمل.
SELECT @user_id AS user_id; -- لو النتيجة NULL يبقى لازم تضيف المستخدم الاول.

-- 3) (اختياري) لو عايز تفضي الارصدة القديمة قبل التعبئة، نفّذ الامر ده.
--    سيبه متعلّق لو عايز تحتفظ بالرصد السابق.
-- DELETE FROM user_balances WHERE user_id = @user_id AND asset IN ('ELTX','USDT','USDC','BNB','ETH');

-- 4) عبّي الرصيد الجديد للمستخدم بنفس الوحدات (wei = 10^18).
INSERT INTO user_balances (user_id, asset, balance_wei)
VALUES
  (@user_id, 'ELTX', 50000000000000000000000),    -- 50,000 ELTX
  (@user_id, 'USDT', 2500000000000000000000),     -- 2,500 USDT
  (@user_id, 'USDC', 1500000000000000000000),     -- 1,500 USDC
  (@user_id, 'BNB', 100000000000000000000),       -- 100 BNB
  (@user_id, 'ETH', 50000000000000000000)         -- 50 ETH
ON DUPLICATE KEY UPDATE
  balance_wei = VALUES(balance_wei);

-- 5) (اختياري) علشان تربط سعر السواب مع المعروض والسيولة الداخلية، عدّل احتياطيات
--    swap_liquidity_pools بناءً على نفس السعر اللي سجلته في asset_prices. كرّر
--    البلوك ده لكل اصل انت محتاجه، مع ضبط الديسيمل الخاص بكل عملة وتغيير
--    المتغيرات قبل ما تعيد التنفيذ.
--    - @pool_eltx_reserve: كمية ELTX اللي عايزها جوه المجمع (بوحدة wei = ‎10^18‎).
--    السعر بيتسحب تلقائياً من asset_prices، ولو صفر سيب البلوك ده متعلّق.
--    مثال: لو عدّلت السعر لـ 0.0001 ELTX لكل 1 USDT، حدّد اي رصيد ELTX مناسب
--    في المتغير @pool_eltx_reserve (مثلاً 1,000 ELTX) والاسكربت هيحسب تلقائيًا
--    كمية USDT المطلوبة علشان نفس السعر يظهر في السواب والسبوت.
SET @pool_asset := 'USDT';
SET @pool_asset_decimals := 18;
SET @pool_eltx_reserve := CAST(50000000000000000000000 AS DECIMAL(65,0)); -- 50,000 ELTX
SET @pool_price_eltx := IFNULL(
  (SELECT price_eltx FROM asset_prices WHERE asset = @pool_asset LIMIT 1),
  CAST(0 AS DECIMAL(36,18))
);
SET @pool_asset_reserve := IF(
  @pool_price_eltx > 0,
  CAST(@pool_eltx_reserve / @pool_price_eltx AS DECIMAL(65,0)),
  NULL
);

INSERT INTO swap_liquidity_pools (asset, asset_decimals, asset_reserve_wei, eltx_reserve_wei)
SELECT
  @pool_asset,
  @pool_asset_decimals,
  @pool_asset_reserve,
  @pool_eltx_reserve
WHERE @pool_asset_reserve IS NOT NULL
ON DUPLICATE KEY UPDATE
  asset_decimals = VALUES(asset_decimals),
  asset_reserve_wei = VALUES(asset_reserve_wei),
  eltx_reserve_wei = VALUES(eltx_reserve_wei);

COMMIT;

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
