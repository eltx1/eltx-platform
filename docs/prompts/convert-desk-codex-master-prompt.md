# Master Prompt for Codex — ELTX Convert Desk Fix & Upgrade

You are GPT-5.3-Codex operating as a senior full-stack engineer inside the **existing ELTX platform repository**.

## Mission
Implement a complete, production-grade fix and enhancement for the Convert Desk (gold/stocks/crypto) with strict quality gates, no regressions, and bilingual support (English primary + Arabic toggle).

## Critical Context
The current user-facing issues include:
1. The top hero content ("Professional Convert Desk" section) is unnecessary and should be reduced to only a clean Back button.
2. Convert UI color palette is visually good but not consistent with the platform’s main design language.
3. Execution mode appears as `Mock`; desired behavior is **live execution by default** (with safe fallback behavior and clear warning handling).
4. Some quotes/prices are clearly wrong (e.g., XAUT/USDT value explosion), so root-cause analysis and robust fixes are required.
5. Convert fee is effectively fixed at 0.5% for operations; admin must be able to update fee dynamically at any time through admin controls (persisted and reflected immediately in quote/execute).
6. Remove the non-essential helper text: `Execution validates fee and minimum threshold before submit`.
7. Asset icons (gold/stocks/crypto pairs) are missing or low quality; replace with real, reliable logos similar in quality expectations to major DEX UX.

## Repository Anchors (start here)
- Frontend convert page: `app/(app)/trade/convert/page.tsx`
- API convert routes and runtime: `api/src/app.js`
- Admin panel fee settings: `app/mo/AdminApp.tsx`
- Convert pair seed/migrations: `db/migrations/*convert*`, especially convert pair/logo/runtime settings migrations
- Existing integration tests: `api/tests/integration.test.js`

## Non-Negotiable Constraints
- Do NOT break existing auth/wallet/trade flows.
- Keep localization support: English + Arabic switch behavior must remain correct.
- No hardcoded fake quote values in production path.
- Use strong validation and explicit error codes/messages.
- Preserve idempotency behavior for execute endpoint.
- Avoid introducing hidden coupling between UI display and mock/live internals.

## Required Workstreams

### A) UX/Frontend Cleanup
1. Refactor convert header section:
   - Remove decorative hero content (`ELTX Convert Pro`, big title, subtitle block).
   - Keep only a compact, elegant Back button area at top.
2. Align Convert page colors with platform theme tokens/classes already used across app pages.
   - Prefer shared utility classes or theme constants instead of one-off colors.
3. Remove helper banner text block about fee/minimum validation.
4. Improve pair card visual hierarchy and ensure execution mode badge clarity.
5. Implement robust logo rendering:
   - Show real token/asset icons from curated URLs/assets.
   - Add fallback placeholder icon if remote logo fails.
   - Ensure images have accessible alt text and graceful load behavior.

### B) Execution Mode: Live-first with Safe Guards
1. Make convert default mode `live` in platform settings bootstrap/migration.
2. Keep safety behavior:
   - If live env is not ready and fallback is allowed: switch to mock with explicit runtime warning.
   - If live env not ready and fallback is disabled: return proper service error.
3. Ensure UI shows **Live** when live execution is active and warns users when temporarily degraded.
4. Remove any misleading UI state that always defaults to mock before real response.

### C) Quote/Price Integrity (Root-cause + Fix)
1. Investigate why XAUT/USDT (and possibly others) produce unrealistic quote totals.
2. Validate and fix all conversion math boundaries:
   - decimals handling (base/quote)
   - unit conversion (wei/string/float)
   - buy vs sell branch correctness
   - fee application order and sign
3. Audit mock path to ensure non-live test prices are sane and bounded (no absurd values).
4. Ensure quote response always returns deterministic numeric strings and correct min/fee impacts.
5. Add defensive checks for impossible output (negative, NaN-equivalent, overflow-like results).

### D) Admin Fee Control (Dynamic)
1. Confirm/implement admin control to change convert fee bps and minimum threshold from panel.
2. Ensure persistence in `platform_settings` and immediate reflection in:
   - `/convert/pairs`
   - `/convert/quote`
   - `/convert/execute`
3. Add/adjust API validation for bounds and malformed values.
4. Add clear admin UI labels (English/Arabic-ready strings if applicable).

### E) Data & Icons Quality
1. Curate valid pair logo URLs/assets for gold/stocks/crypto pairs.
2. Update seeds/migrations or admin defaults to provide meaningful logos.
3. Ensure no broken image links for default supported pairs.

## Testing & Verification Plan (must execute)
Run all relevant checks and include exact command outputs summary in final report:
1. Unit/integration tests for API convert paths.
2. Regression tests for execute idempotency and fee/min threshold logic.
3. Frontend build and type checks.
4. Full project build (`npm run build`).
5. If available, targeted e2e or component tests for Convert flow.

Minimum command checklist (adjust to repo scripts):
- `npm ci` (if needed)
- `npm test -- --runInBand` or project-equivalent test command
- `npm run lint` (if configured)
- `npm run build`

If a dependency/environment piece is missing, implement a **demo-safe mock fallback** for tests rather than stopping midway.

## Screenshot Requirements
If frontend visuals changed:
1. Run app locally.
2. Capture at least one PNG screenshot of Convert page after fix using available headless/browser tooling.
3. Include artifact path and short caption in final report.

## Output Format for Your Final Delivery
Provide a structured report with:
1. **Root Cause Analysis** (what caused wrong prices/mode/UI mismatches).
2. **Files Changed** (grouped by frontend/backend/db/tests).
3. **Behavior Before vs After**.
4. **Test Results** (with pass/fail and key output snippets).
5. **Risks & Follow-ups**.
6. **Screenshot references** (PNG paths).

## Implementation Quality Bar
- Production-safe, readable, minimal-diff where possible.
- Backward compatible with existing data.
- Clear naming and no dead code.
- Strong error handling and consistent response shapes.
- Arabic + English UX continuity preserved.

Now execute this plan end-to-end inside the repo and do not stop at partial fixes.
