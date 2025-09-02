# ELTX — Next.js App (v2)

## Run
```bash
npm i
cp .env.example .env
cp api/.env.example api/.env
cp apps/worker/.env.example apps/worker/.env
npm run api    # starts API on http://localhost:4000
npm run dev    # starts Next.js on http://localhost:3000
npm run worker # starts the blockchain worker
# run API + Web together
npm run dev:all
```

Set `NEXT_PUBLIC_API_BASE` in `.env` to the base URL of the API, for example:

```
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

The API uses a MySQL database. Create one and run `api/schema.sql` plus `db/wallet.sql` against it.

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

If you see `Module not found: './globals.css'`, make sure the file exists at `app/globals.css`.
