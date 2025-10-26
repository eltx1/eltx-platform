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

`CORS_ORIGIN` accepts a comma-separated list of allowed origins, e.g. `https://eltx.online`.

If you see `Module not found: './globals.css'`, make sure the file exists at `app/globals.css`.

### Auth responses
`POST /auth/signup` and `POST /auth/login` both return the user's hot-wallet address:

```json
{ "ok": true, "wallet": { "address": "0x..." } }
```
