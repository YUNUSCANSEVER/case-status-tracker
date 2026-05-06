# CORS Fix

This Worker update allows:

- http://localhost:5173
- http://127.0.0.1:5173
- FRONTEND_ORIGIN secret value
- Any HTTPS `*.vercel.app` preview/production URL

After replacing `worker/src/index.js`, redeploy:

```bash
cd "C:\Users\cnsvr\Desktop\Case Tracker\worker"
npm run deploy
```

Then refresh the Vercel site with Ctrl + F5 and login again.
