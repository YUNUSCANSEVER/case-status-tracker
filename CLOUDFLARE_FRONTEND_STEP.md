# Cloudflare Worker Frontend Step

This frontend now talks to:

https://case-status-tracker-api.casetrackerapp.workers.dev

Login is no longer checked locally in React. It uses:

POST /api/auth/login

Use the ADMIN_USERNAME and ADMIN_PASSWORD that you added with Wrangler secrets.

## Local test

Run frontend:

npm run dev

Open:

http://localhost:5173

Login with your Worker admin credentials.

## Expected

Dashboard should show:

DB: ok · Provider: uscis-api

Cases should load from Supabase through Cloudflare Worker.
