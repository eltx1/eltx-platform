# Cloudflare Cache Rules

## API bypass (إلزامي)
- Rule: **If** `http.request.uri.path` *contains* `/api/`
- **Then**: Cache Level = **Bypass** + Origin Cache Control = **On** + Edge TTL = **0**
- الهدف إن هيدرات الـ API (`Cache-Control: no-store, no-cache, must-revalidate, max-age=0` و`Pragma: no-cache`) توصل للعميل من غير ما Cloudflare يركن الاستجابة.
- تأكد إن مفيش Rule تانية من نوع "Cache Everything" أو "Ignore Query String" بتصطاد `/api/*`.

## Service Worker و التحديثات
- `public/sw.js` بيعدي طلبات `/api/*` بـ `cache: no-store` وبي prompt المستخدم لو في نسخة جديدة. بعد كل نشر للواجهة، اعمل Purge لـ `/sw.js` وأي صفحات اتغيرت علشان الـ prompt يظهر بسرعة.
- ما تعملش Cache Everything على `/sw.js` أو صفحات الـ Dashboard اللي محتاجة تبقى Live (`/wallet`, `/transactions`، أو أي صفحة معاملات ديناميكية).

## التحقق (Debug)
- من التيرمنال: `curl -I https://api.eltx.online/wallet/transactions -H "Cookie: sid=..."` وتوقع `CF-Cache-Status: DYNAMIC|BYPASS`.
- من DevTools: بص على `CF-Cache-Status` و`Cache-Control`، وتأكد إن الـ response مش HIT.
- لو حصل HIT: نفّذ Purge by URL للأصول المعدلة (`/sw.js`، الصفحات الديناميكية) أو راجع ترتيب الـ Rules.

Static assets (e.g. `/_next/static/*`, `/assets/*`) ممكن تتخزن كالمعتاد.
