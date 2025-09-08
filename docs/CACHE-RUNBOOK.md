# Cache Verification Runbook

## Check API headers
```bash
curl -I https://api.eltx.online/wallet/transactions -H "Cookie: sid=..."
```
Expect:
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
- `Pragma: no-cache`
- `Vary: Authorization, Cookie`

## Verify Cloudflare
- In Cloudflare dashboard, ensure Cache Rule for `/api/` shows **Bypass**.
- In DevTools network tab, `CF-Cache-Status` should be `DYNAMIC` or `BYPASS` for API requests.

## Purge targeted assets
- Use Cloudflare Purge by URL for modified files (`/sw.js`, affected pages) after deployment.
