# Case Status Tracker - Supabase Backend Step 1

This is the backend/database foundation for:

- React/Vite frontend
- Express backend
- Supabase PostgreSQL database
- Backend cron auto-check every 15 minutes

## 1. Create Supabase tables

Open Supabase > SQL Editor and run:

```sql
supabase/schema.sql
```

## 2. Configure backend .env

Inside `server`:

```bash
cp .env.example .env
```

Fill:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Keep the service role key only in the backend. Do not put it inside React.

## 3. Install and run backend

```bash
cd server
npm install
npm run dev
```

Test:

```text
http://localhost:4000/api/health
```

You should see:

```json
{
  "status": "ok",
  "database": "ok"
}
```

## 4. Auto check

Backend cron uses:

```env
AUTO_CHECK_CRON=*/15 * * * *
```

That means every 15 minutes.

If USCIS credentials are blank, the backend returns demo statuses. Once USCIS credentials are filled, the same cron job will call the live provider path.
