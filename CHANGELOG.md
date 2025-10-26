# Changelog

## Unreleased
- Added server-side headers to disable caching for wallet and transaction APIs.
- Marked transaction-related pages as dynamic with polling and focus refresh for fresh data.
- Introduced Service Worker that bypasses `/api/*` requests and prompts for reload on updates.
- Documented Cloudflare cache bypass rule and Apache `.htaccess` for API paths.
- Added runbook for verifying cache headers and targeted purges.
- Fixed worker scan bounds query to use the correct `address` column and shared DB client.
- Isolated worker and API folders from Next.js build and ESLint.
- Replaced Hero image with optimized `next/image` component.
