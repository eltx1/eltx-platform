# Project Brief

## Hot Wallet & Dashboard
- Centralized hot wallet on BSC Mainnet (chain_id=56)
- User address derived on signup or first login
- Dashboard and Wallet pages (mobile-first) display address and deposits
- Background worker monitors blocks and records BNB deposits
- Transactions + wallet screens marked **dynamic** with polling and focus-refresh to keep balances Live; API responses are `no-store` so Cloudflare/Apache لازم يكونوا Bypass لـ `/api/*`.
- Service Worker (`/sw.js`) bypasses `/api/*` requests and prompts users to reload عند صدور نسخة جديدة علشان مايبقاش فيه UI قديم في الكاش.
- Spot trading فيه أزواج ELTX/BNB و ELTX/ETH وعمولة افتراضية 0.50% للسواب والسبوت؛ تقدر تعدلها ومراجعة الرصيد من تبويب **Fees** في `/mo`.
