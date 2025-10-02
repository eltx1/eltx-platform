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

## ليه السكربت ده مهم؟
طلباتك كانت:

1. **تحديد سعر ELTX يدويًا** علشان تختبر السواب لما سعر الدولار يبقى مثلًا ‎0.0001‎ ELTX.
2. **تزويد رصيد لحسابك التجريبي** بأكتر من عملة قبل ما تجرّب السواب.
3. **ربط السواب بالسبوت** بحيث السيولة الداخلية تعكس نفس السعر (Ledger داخلي).

السكريبت بيحقّق التلات نقط دول في خطوة واحدة:

* كل القيم اللي محتاج تغيّرها موجودة في بلوك كونفيج في أول الملف (الإيميل، الأسعار، الحدود، السبريد، الأرصدة، واحتياطي مجمعات السيولة).
* بيكتب الأسعار في `asset_prices`، فواجهة السواب والسبوت تشوف نفس سعر ELTX اللي حدّدته.
* بيعيد تعبئة رصيد المستخدم في `user_balances` بالقيم اللي تختارها (بنفس وحدة wei اللي بيستخدمها الباك إند).
* عن طريق الإجراء `ensure_swap_pool` بيحسب رصيد العملة المقابلة بناءً على كمية ELTX اللي تحطها في كل مجمع، وبيحدّث `swap_liquidity_pools`، فبالتالي العرض والطلب جوه المنصة يبقى متماشي مع الأسعار اللي اخترتها.

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
