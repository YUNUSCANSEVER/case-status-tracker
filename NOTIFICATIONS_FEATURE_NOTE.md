# Notifications Feature

Added a bell icon in the top bar.

It shows notifications only when a case status changes, including:
- Manual edit status changes
- Check Now status changes
- Check All Cases status changes
- Cloudflare 15-minute cron status changes

Behavior:
- Red badge shows unread status-change notifications
- Clicking the bell opens a popup list
- Opening the popup marks current notifications as read on that browser/device
- Clicking a notification selects that case on the Dashboard

Files to replace:
- src/App.jsx
- src/App.css
- src/index.css

Then push to GitHub:
git add .
git commit -m "add case status notifications"
git push
