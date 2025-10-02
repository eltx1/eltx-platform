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

السكريبت بيوفّر بلوك كونفيج واضح في بدايته تقدر تغيّر فيه:
* البريد اللي هتشتغل عليه عشان يجيب الـ `user_id` تلقائي.
* اسعار ELTX مقابل USDT/USDC/BNB/ETH (فيه مثال جاهز لـ 1 USDT = ‎0.0001‎ ELTX).
* حدود السواب والسبريد.
* أرصدة المستخدم اللي هتتعبّا تلقائيًا.
* رصيد مجمع السواب لكل أصل بحيث السعر اللي بتحطه في `asset_prices` ينعكس في `swap_liquidity_pools`.

بعد ما تعدّل القيم، السكريبت بينفّذ معاملة واحدة بتحدّث الاسعار، تعبي رصيد المستخدم، وتهندس السيولة في مجمعات السواب من خلال برسيجر مساعد (بيتم حذفه تلقائيًا في نهاية السكربت). وفي آخره استعلامات للتأكد من التحديثات.

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
