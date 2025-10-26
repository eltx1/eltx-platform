# Cloudflare Cache Rules

Create a Cache Rule to bypass caching for API routes:

- **If**: `http.request.uri.path` contains `/api/`
- **Then**:
  - Cache level: Bypass
  - Origin Cache Control: On

Ensure no "Cache Everything" rule applies to `/api/*`.

Static assets may still be cached normally (e.g. `/_next/static/*`, `/assets/*`).
