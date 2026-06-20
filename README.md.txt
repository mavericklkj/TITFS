# Trade Journal (PWA)

A private, offline-first trade journal. All data lives in your browser (IndexedDB) — nothing is sent anywhere.

## Features
- Two-stage trade lifecycle: log entry first, add TP/SL/BE + result later
- Multiple labelled screenshots per trade (entry / result)
- Saveable pairs, setup tags, and tiers (editable in the Manage tab)
- Full stats: win rate, total/avg R, P&L, profit factor, expectancy, streaks, avg hold, equity curve, and breakdowns by setup / pair / tier
- JSON backup (full restore) + ZIP export (browseable PNG files)
- Installable on iPhone & desktop, works offline

## Run locally
A service worker needs a server (not `file://`):
```bash
npx serve .
# or
python3 -m http.server
```
Then open the shown URL.

## Deploy to GitHub Pages
1. Create a repo, push these files to the root.
2. Repo → Settings → Pages → Source: `main` branch, `/ (root)`.
3. Wait for the URL, open it, then "Add to Home Screen" on iPhone to install.

## Icons
Add two PNGs in `icons/`: `icon-192.png` (192×192) and `icon-512.png` (512×512).
Quickest: any image → https://realfavicongenerator.net or an online resizer.
The app still works without them, but install prompts look nicer with them.

## Backup discipline
Data is **local to each device**. Clearing browser data erases it.
Use **Backup → Export JSON** regularly. To move between devices, export on one and import on the other.

## Notes
- ZIP export gives you real PNG files to browse, but re-import expects the **JSON** export (it embeds images for lossless restore).
- No accounts, no servers, no tracking.