# LordAi.Net — Next.js App (v2)

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

### Social platform tables (LordAi.Net)
- شغّل ترحيل `db/migrations/202504050900_social_core.sql` علشان يتضاف نظام البروفايلات والبوستات والتفاعل و الـ Follow.


### AI provider switching (OpenAI ↔ Ollama)

The AI layer can now run through either OpenAI or a local Ollama server.

Add these variables in both `.env` and `api/.env`:

```env
USE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:2b
```

- `USE_OLLAMA=true` → routes AI calls to Ollama (`/api/chat`, `stream: false`).
- `USE_OLLAMA=false` → falls back to OpenAI Chat Completions.
- Admin panel (`/mo` → AI tab) shows the active provider/runtime model so you can verify the current mode quickly.

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
CONVERT_HOT_WALLET_ADDRESS
CONVERT_HOT_WALLET_PK
BSC_RPC_URL
DATABASE_URL
CORS_ORIGIN
SESSION_COOKIE_DOMAIN
SESSION_COOKIE_NAME
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
```

> Convert on-chain execution uses `CONVERT_HOT_WALLET_*` only. `OMNIBUS_*` stays dedicated to deposit/sweeper flows and is not used for convert execution.

### HD wallet guardrails
- The platform uses a single `MASTER_MNEMONIC` per environment; do **not** rotate it once user
  addresses have been generated.
- Derivation follows `m/44'/60'/0'/0/<index>` for every user wallet. The helper at
  `src/utils/hdWallet.js` must be the only place that derives paths/keys so the API and sweepers
  stay in sync.

`CORS_ORIGIN` accepts a comma-separated list of allowed origins, e.g. `https://lordai.net`.

If you see `Module not found: './globals.css'`, make sure the file exists at `app/globals.css`.

### Production build + PM2 runbook

For Linux production servers (especially with case-sensitive filesystems), use this checklist before deploy:

1. Confirm the stylesheet path is exact and tracked by Git:
   - `app/layout.tsx` must import `./globals.css` (all lower-case).
   - `app/globals.css` must exist exactly with the same case.
   - Run: `git ls-files app/globals.css` to verify it is tracked.
2. Build from the project root only (`/workspace/eltx-platform` in local/dev containers).
3. Keep existing npm scripts unchanged because they intentionally load env using:
   - `node -r dotenv/config`
   - `DOTENV_CONFIG_PATH=/home/dash/.env` fallback logic.

PM2 note (critical): if logs show `pm2: command not found`, PM2 is not installed or not in PATH for the same OS user running the app.

- Install PM2 for the runtime user (example: `dash`), not only for `root`.
- Start/restart the app using the same user that owns `/home/dash/.env`.
- Mixing users (`root` installs PM2, `dash` runs npm scripts) commonly causes this error.

Suggested commands (run as `dash` user):

```bash
npm run build
pm2 start npm --name eltx-web -- start
pm2 save
```

Do not print secrets from `/home/dash/.env` in logs or shell history.


API process note (critical): if PM2 logs show `Error: Cannot find module '/home/dash/public_html/lordai.net/api'`, the API process was started with a wrong entrypoint (`node .../api`).

Use the npm script entrypoint instead so PM2 runs `api/server.js` from the project root:

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Or for API-only restart:

```bash
pm2 restart api --update-env
```

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
`https://api.lordai.net/stripe/webhook` (or `https://<api-domain>/stripe/webhook`). Use the same
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
