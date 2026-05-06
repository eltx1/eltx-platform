# SECURITY REPORT

## Scope
- Full repository grep audit for upload, RCE, traversal, injection, SSRF, CSRF, unsafe scripts, and runtime hardening.
- Key commands used:
  - `rg -n "(multer|upload|child_process|exec\(|spawn\(|eval\(|new Function|csrf|rate.?limit|pm2|postinstall|preinstall|chmod|chown|cron|\.env)" --glob '!node_modules'`
  - `npm run typecheck`
  - `npm run build`

## Critical issues found & fixed

### 1) Weak upload content validation (MIME spoof risk)
- **Location:** `app/api/social/uploads/route.ts`
- **Risk:** Attackers could fake `Content-Type` and upload non-image/polyglot payloads.
- **Fix:** Added magic-byte MIME detection (jpeg/png/webp/gif), strict match against declared MIME, and executable signature blocking.

### 2) Upload format policy too broad for platform policy
- **Location:** `app/api/social/uploads/route.ts`
- **Risk:** `image/avif` previously accepted though not in approved allowlist.
- **Fix:** Enforced exact allowlist: jpg/jpeg/png/webp/gif.

### 3) Upload filename hardening
- **Location:** `app/api/social/uploads/route.ts`
- **Risk:** Predictability/operational leakage in generated names.
- **Fix:** Strengthened randomized names using `randomUUID` + timestamp-base36.

### 4) Public upload execution/render abuse surface
- **Location:** `app/api/social/uploads/[filename]/route.ts`
- **Risk:** Inline rendering can increase browser-side exploitation surface with ambiguous content.
- **Fix:** Forced `Content-Disposition: attachment` and added strict CSP sandbox + nosniff headers.

### 5) Missing security headers/rate-limit at Next.js edge layer
- **Location:** `middleware.ts` (new)
- **Risk:** Next.js app routes lacked consistent defense-in-depth headers and app-layer throttling.
- **Fix:** Added global security headers and targeted rate limiting for `/api/social/uploads` and `/api/social/posts`.

## Additional audit findings (non-blocking / already mitigated)
- Express API already uses `helmet` and dedicated rate limiters in `api/src/app.js`.
- No direct `eval` / `new Function` / `exec(` command injection sinks found in first-party code.
- Child process usage exists in local scripts (`scripts/next-with-dotenv.js`, `scripts/ensure-next-build.js`) with static arguments, not user-controlled.
- No malicious `preinstall`/`postinstall` hooks found in first-party `package.json` files.
- PM2 config file not present in repo (operational hardening remains infra responsibility).

## Remaining risks
1. In-memory middleware rate limiting is per-instance and resets on restart (recommend Redis-backed distributed limiter).
2. Some mutation APIs rely on app-level auth logic but still accept browser requests; explicit CSRF tokens should be added for sensitive state changes.
3. SSRF hardening: any env-configurable outbound URL (e.g. `PRICE_URL`) should be constrained by allowlist in production.
4. Dependency malware risk remains a supply-chain concern; enforce lockfile integrity, npm provenance, and CI scanners.

## Recommended infrastructure hardening
- Run Node/PM2 as non-root with read-only FS where possible.
- Mount upload storage outside executable paths; disable script execution at reverse proxy level.
- Add WAF rules for upload and auth endpoints.
- Centralized rate limit store (Redis) + bot detection.
- Add SCA/SBOM tooling (e.g., `npm audit --production`, osv-scanner, Dependabot) in CI.
- Protect `.env` with strict file perms and avoid absolute-path leakage in logs.
