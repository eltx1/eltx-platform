# ELTX — Next.js App (v2)

## Run
```bash
npm i
cp .env.example .env
npm run api    # starts API on http://localhost:4000
npm run dev    # starts Next.js on http://localhost:3000
# run both together
npm run dev:all
```

The API uses a MySQL database. Create one (for example via cPanel’s **MySQL Database Wizard**), then run `api/schema.sql` against it. The `users` table now tracks `email`, `username` and preferred `language`.

If you see `Module not found: './globals.css'`, make sure the file exists at `app/globals.css`.
