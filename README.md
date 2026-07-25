# Seven Up Scorekeeper

An offline-first, installable scorekeeping web app for Flip Seven-style card games. It includes quick score entry, a rule-aware card calculator, configurable target score, resumable games, history, and all-time player statistics.

## Public beta

Open `https://jml845.github.io/seven-up-scorekeeper/` in a mobile browser. On Android, use Chrome's install prompt or **Add to Home screen**. On iPhone, open the site in Safari, tap **Share**, then **Add to Home Screen**.

Game data remains in the current browser on the current device. Clearing site data or uninstalling may remove it. See `privacy.html` for the beta privacy notice and independent-utility disclaimer.

See `BETA_TESTING.md` for install instructions, suggested checks, and known beta limitations.

TV Mode provides a 16:9 full-screen read-only scoreboard for phone screen mirroring or Chrome tab casting. It automatically changes to two columns above eight players so all 18 supported players remain visible without scrolling. When opened in a second tab on the same browser, it updates through `BroadcastChannel` and local-storage events while the first tab is used to score.

## Run it

From this folder:

```bash
python3 -m http.server 8787
```

Open `http://localhost:8787`. On a phone, use the browser's **Add to Home Screen** option. A web server is required for offline installation; opening `index.html` directly still supports basic scoring but not the service worker.

On the configured home server, the persistent user service is `seven-up-scorekeeper.service`. The LAN address is `http://172.30.162.143:8787`; the private Tailscale HTTPS address is shown by `tailscale serve status`.

## Data

All data is stored in the current browser's local storage under `seven-up-scorekeeper-v1`. Clearing that browser's site data also clears the score history.

## Test

```bash
node tests.mjs
```

This is an independent scorekeeping utility and does not use publisher artwork or claim publisher affiliation.
