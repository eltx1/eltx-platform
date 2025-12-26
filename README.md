# ELTX — Next.js App (v2)

## Run
```bash
npm i
cp .env.example .env
cp api/.env.example api/.env
cp apps/worker/.env.example apps/worker/.env
npm run api    # starts API on port 4000
npm run dev    # starts Next.js dev server
npm run worker # starts the blockchain worker
# run API + Web together
npm run dev:all
```

Set `NEXT_PUBLIC_API_BASE` in `.env` to the base URL of the API.

The API uses a MySQL database. Create one and run `api/schema.sql` plus `db/wallet.sql` against it.

Re-run `db/wallet.sql` after updates to remove any legacy columns.

### Seed swap testing data
استخدم سكريبت الـ SQL اليدوي لو عايز تضبط اسعار السواب وتزود رصيد مستخدم بنفسك:

```bash
mysql -u <user> -p <database> < docs/sql/manual_swap_seed.sql
```

السكريبت بيسجّل اسعار تقريبية لـ ELTX مقابل USDT/USDC/BNB/ETH، وبيدي مثال ازاي تجيب `user_id` بالبريد وتزوّد الرصيد بعملات مختلفة. عدّل القيم جوه الملف قبل ما ترنه عشان تناسب تجربتك، ولو محتاج السعر يتغيّر مع السيولة الداخلية اربط نفس القيمة في بلوك تحديث `swap_liquidity_pools` جوه السكريبت علشان السواب والسبوت يعكسوا نفس المعروض (وفي آخر السكربت فيه استعلام بيوضح أرصدة المجمع بعد التنفيذ).

> لو محتاج تصفّي الرصيد القديم، فك التعليق عن أمر الـ `DELETE` الموجود **قبل** أوامر الإدراج مباشرة علشان مايمسحش القيم الجديدة.

### Platform fees & new spot pairs
- العمولة الافتراضية بقت 0.50% (50 bps) للسواب وللسبوت (ميكر وتيكر)، وتقدر تعدلها أو تراجع رصيد العمولات من تبويب **Fees** في لوحة `/mo`.
- تم إضافة أزواج سبوت جديدة ELTX/BNB و ELTX/ETH. شغّل ترحيل `db/migrations/202503300000_platform_fees_and_pairs.sql` أو حدّث `db/wallet.sql` علشان تتسجل عندك.

### ENV required (names only)
```
CHAIN
CHAIN_ID
RPC_HTTP
RPC_WS
CONFIRMATIONS
MASTER_MNEMONIC
OMNIBUS_ADDRESS
OMNIBUS_PK
DATABASE_URL
CORS_ORIGIN
SESSION_COOKIE_DOMAIN
SESSION_COOKIE_NAME
```

### HD wallet guardrails
- The platform uses a single `MASTER_MNEMONIC` per environment; do **not** rotate it once user
  addresses have been generated.
- Derivation follows `m/44'/60'/0'/0/<index>` for every user wallet. The helper at
  `src/utils/hdWallet.js` must be the only place that derives paths/keys so the API and sweepers
  stay in sync.

`CORS_ORIGIN` accepts a comma-separated list of allowed origins, e.g. `https://eltx.online`.

If you see `Module not found: './globals.css'`, make sure the file exists at `app/globals.css`.

### Stripe card payments

The dashboard now exposes a **Buy Crypto** flow backed by Stripe. To activate it you must set the
following variables (see `.env.example` for defaults):

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PUBLISHABLE_KEY` (optional if you reuse the public key)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_BASE_URL`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` for redirect handling
- `STRIPE_MIN_PURCHASE_USD` / `STRIPE_MAX_PURCHASE_USD` to clamp purchase limits

In production you can now move the Stripe values out of the environment file and into the
`platform_settings` table. Insert or update the following keys to override the runtime config:

- `stripe_publishable_key`
- `stripe_secret_key`
- `stripe_webhook_secret`
- `stripe_return_url_base`, `stripe_success_url`, `stripe_cancel_url`
- `stripe_min_purchase_usd`, `stripe_max_purchase_usd`

The API polls these rows periodically (and at startup) so you can rotate keys without rebuilding
the frontend.

After configuring the keys, register the webhook endpoint at the full API path
`https://api.eltx.online/stripe/webhook` (or `https://<api-domain>/stripe/webhook`). Use the same
host you expose as `NEXT_PUBLIC_API_BASE`—the **API** host, not the public frontend—to avoid 404
responses from the website server. There is no extra path segment beyond `/stripe/webhook`.

### Email notifications

Email delivery reuses the existing SMTP environment variables (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`). The admin console at `/mo` now exposes a
"Notifications" tab where you can toggle delivery and configure the sender plus admin
recipients without redeploying.

The following `platform_settings` keys back the runtime configuration. Insert or update them as
needed:

- `email_enabled`
- `email_from_address`
- `email_admin_recipients`
- `email_user_welcome_enabled`
- `email_user_kyc_enabled`
- `email_admin_kyc_enabled`
- `email_user_p2p_enabled`
- `email_admin_p2p_enabled`
- `email_user_withdrawal_enabled`
- `email_admin_withdrawal_enabled`
- `email_user_support_enabled`
- `email_admin_support_enabled`

If SMTP credentials are missing, emails are skipped gracefully while the rest of the platform
continues to run.

#### Database migration

The feature introduces a new table `fiat_purchases` plus additional metadata columns
on `wallet_deposits`. Apply the SQL found in `db/migrations/202503230900_stripe_fiat_purchases.sql`
against your primary database before enabling payments. The schema loader in the API will
create the structures automatically when it runs, but running the migration manually keeps
local and production environments in sync.

#### Package lock refresh

`@stripe/stripe-js` and `stripe` were added as runtime dependencies. If the lock file fails
to regenerate because the registry blocks downloads in your environment, rerun
`npm install --package-lock-only` once access is restored so the new modules are captured in
`package-lock.json`.

### Auth responses
`POST /auth/signup` and `POST /auth/login` both return the user's hot-wallet address:

```json
{ "ok": true, "wallet": { "address": "0x..." } }
```

### Live data & cache guardrails
- تم تعيين مسارات `/wallet` و `/api/transactions` علشان تبعت هيدر `Cache-Control: no-store` و`Pragma: no-cache`، فالمحتوى دايماً Live. لو عندك بروكسي زي Cloudflare أو Apache، فعّل قاعدة Bypass لـ `/api/*` (شوف `docs/CLOUDFLARE.md`) أو استخدم إعدادات `.htaccess` اللي في الجذر علشان تمنع التخزين المؤقت.
- صفحات المعاملات والمحفظة في الـ Dashboard متعلمة `dynamic` وبتعمل polling وإعادة طلب عند استعادة التركيز، فـ سيبها كده علشان تقرّي أحدث البيانات حتى مع تفعيل Service Worker.
- Service Worker (`public/sw.js`) بيعدي أي طلبات `/api/*` بمود `no-store` وبيطلع Prompt Reload لما ينزل إصدار جديد. بعد أي نشر للواجهة، اعمل Purge لـ `/sw.js` وأي صفحات متأثرة من الـ CDN علشان المستخدمين يشوفوا التحديث فوراً (راجع `docs/CACHE-RUNBOOK.md`).
