# Auto Check All Cases Update

Why this update was needed:

The previous Worker auto-check logic skipped terminal statuses such as `Approved`, `Produced`, `Denied`, and `Rejected`.

So if a case was manually changed to `Rejected`, the 15-minute cron did not check it again.

This version changes the Worker cron/check-all logic to check **all tracked cases** every 15 minutes.

## Replace / deploy

1. Replace:

```text
worker/src/index.js
src/App.jsx
src/App.css
src/index.css
```

2. Deploy Worker again:

```bash
cd "C:\Users\cnsvr\Desktop\Case Tracker\worker"
npm run deploy
```

3. Push frontend changes to GitHub so Vercel redeploys:

```bash
cd "C:\Users\cnsvr\Desktop\Case Tracker"
git add .
git commit -m "check all tracked cases with cron"
git push
```

After that, cron will correct manually changed statuses such as `Rejected` if USCIS returns a different status.
