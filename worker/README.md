# Cloudflare Worker API - Case Status Tracker

This Worker replaces the paid/always-on backend requirement.

It provides:

- API endpoints for the React frontend
- Supabase database access
- USCIS API check
- Scheduled auto-check every 15 minutes using Cloudflare Cron Triggers

## 1. Install

```bash
cd worker
npm install
```

## 2. Login to Cloudflare

```bash
npx wrangler login
```

## 3. Add secrets

Run these one by one:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put USCIS_CLIENT_ID
npx wrangler secret put USCIS_CLIENT_SECRET
npx wrangler secret put USCIS_TOKEN_URL
npx wrangler secret put USCIS_CASE_STATUS_URL
npx wrangler secret put USCIS_SCOPE
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put FRONTEND_ORIGIN
```

Recommended values:

```text
USCIS_TOKEN_URL=https://api-int.uscis.gov/oauth/accesstoken
USCIS_CASE_STATUS_URL=https://api-int.uscis.gov/case-status
USCIS_SCOPE=
ADMIN_USERNAME=your admin username
ADMIN_PASSWORD=your admin password
SESSION_SECRET=make a long random string
FRONTEND_ORIGIN=http://localhost:5173 for local testing, later your Vercel URL
```

## 4. Deploy

```bash
npm run deploy
```

After deploy, Wrangler prints a URL like:

```text
https://case-status-tracker-api.YOUR_SUBDOMAIN.workers.dev
```

Test:

```text
https://case-status-tracker-api.YOUR_SUBDOMAIN.workers.dev/api/health
```

Expected:

```json
{
  "status": "ok",
  "service": "Case Status Tracker Worker API",
  "database": "ok",
  "providerMode": "uscis-api",
  "autoCheckCron": "*/15 * * * *"
}
```

## 5. Important

This Worker protects case endpoints with login tokens.

The frontend needs to be updated in the next step to log in through this Worker and send the token with API requests.
