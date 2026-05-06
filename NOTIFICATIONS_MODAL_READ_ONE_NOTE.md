# Notifications Modal + Read One Update

Changes:
- Notifications now open as a centered popup/modal with backdrop.
- Opening notifications does NOT mark all as read anymore.
- Clicking one notification marks only that notification as read.
- The badge count decreases one-by-one.
- Mark all read still exists if you want to clear the badge.

Replace:
- src/App.jsx
- src/App.css
- src/index.css

Then:
git add .
git commit -m "make notifications modal and read individually"
git push
