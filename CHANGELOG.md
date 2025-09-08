# Changelog

## Unreleased
- Added server-side headers to disable caching for wallet and transaction APIs.
- Marked transaction-related pages as dynamic with polling and focus refresh for fresh data.
- Introduced Service Worker that bypasses `/api/*` requests and auto-updates clients.
- Documented Cloudflare cache bypass rule and Apache `.htaccess` for API paths.
- Added runbook for verifying cache headers and targeted purges.
