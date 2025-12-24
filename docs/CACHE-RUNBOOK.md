# Cache Verification Runbook

## Check API headers
```bash
curl -I https://api.eltx.online/wallet/transactions -H "Cookie: sid=..."
```
Expect:
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
- `Pragma: no-cache`
- `Vary: Authorization, Cookie`

## Verify Next.js pages stay fresh
- افتح `/wallet` أو `/transactions` في DevTools Network وشغّل **Disable cache**.
- ركّز إن `x-nextjs-cache` (لو موجود) تكون `BYPASS` أو فاضية، وإن الطلبات بتتكرر مع Polling/Focus refresh (مفيش Stale data).
- من الـ console: `performance.getEntriesByType('resource').filter(r => r.name.includes('/api/transactions'))` المفروض تلاقي طلبات جديدة على فترات قصيرة وقت ما الصفحة قدام المستخدم.

## Verify Cloudflare
- In Cloudflare dashboard, ensure Cache Rule for `/api/` shows **Bypass**.
- In DevTools network tab, `CF-Cache-Status` should be `DYNAMIC` or `BYPASS` for API requests.

## Service Worker bypass & reload prompt
- افتح التاب Application > Service Workers وتأكد إن `/sw.js` Registered و Controlling.
- من Network، أي طلب لـ `/api/*` لازم يظهر بـ `cache-control: no-store` من السيرفر، ومفيش Stale/HIT.
- حدّث نسخة الـ SW: زوّد query param وهمي في `/sw.js?test` أو اعمل "Update on reload" في DevTools، ولاحظ الـ prompt اللي بيطلب Reload. قبول الـ prompt لازم يعمل `controllerchange` وإعادة تحميل أوتوماتيك.

## Purge targeted assets
- Use Cloudflare Purge by URL for modified files (`/sw.js`, affected pages) after deployment.
