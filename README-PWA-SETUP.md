# Quran Journal — PWA setup notes

## What was changed

Your app's design, content, layout, and all Quran-journal features (surahs, tafsir,
reflections, dhikr counters, tracker, favorites, notes, the flip-through Quran book)
are **completely untouched**. Nothing in the app itself was modified — only files
were *added*, and a small amount of `<head>` markup was added to `index.html`.

New/changed files:

1. **`index.html`** (renamed from `quran-journal.html`)
   Same file as before, with these additions inside `<head>` only:
   - `<link rel="manifest" href="manifest.json">`
   - `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`,
     `apple-mobile-web-app-status-bar-style`, and `mobile-web-app-capable` meta tags
   - `apple-touch-icon` links (for the Home Screen icon on iPhone/iPad)
   - Regular favicon links
   - A small script that registers the service worker
   - `viewport-fit=cover` added to the existing viewport tag (lets content use the
     full screen on notched iPhones once installed as an app — safe, no visual change
     unless you later choose to use safe-area CSS)

2. **`manifest.json`** (new) — tells iOS/Android/desktop browsers the app's name,
   icon, colors, and that it should open full-screen ("standalone") like a native
   app instead of in a browser tab.

3. **`service-worker.js`** (new) — caches the app shell (the HTML file + icons +
   manifest) so the app can launch even with no connection, the same way it already
   works when you open it directly as a file. It does **not** touch your saved
   journal data — that all lives in `localStorage`, which the service worker cannot
   see or clear.

4. **`icons/` folder** (new) — a full set of app icon sizes (16 up to 512px, plus the
   iOS-specific sizes) generated from a simple custom icon (a gold crescent moon and
   star on your existing dusty-pink/sand/ivory gradient) since there wasn't a
   separate logo image file to reuse — the app's branding was built entirely from
   text, emoji, and CSS. If you have an actual logo image you'd like used instead,
   send it and I'll regenerate this folder from it.

   The source vector is included at `source/icon-master.svg` if you ever want to
   tweak the design yourself.

## What you need to do on GitHub

1. In your repository, replace the old `quran-journal.html` (if it's the one your
   GitHub Pages site currently serves) with this new **`index.html`**, and add
   **`manifest.json`**, **`service-worker.js`**, and the **`icons/`** folder to the
   **same directory** as `index.html`. Don't nest them in a subfolder — the paths
   inside `index.html` and `manifest.json` are all relative (`icons/...`,
   `manifest.json`, `service-worker.js`, with no leading `/`), specifically so this
   works whether your Pages site is served from the repo root
   (`https://username.github.io/`) or from a project subpath
   (`https://username.github.io/repo-name/`). Keeping everything in one folder keeps
   those relative paths correct either way.

2. Commit and push. GitHub Pages will pick up the new files automatically — no
   settings changes needed there.

3. **Test it**: open the site's real GitHub Pages URL (not a local file) in Safari
   on an iPhone, tap the **Share** button, then **Add to Home Screen**. The custom
   icon should appear, and opening it from the Home Screen should launch full-screen
   without Safari's address bar.

   Two important notes about Safari specifically:
   - Safari **requires HTTPS** for service workers and full PWA behavior — GitHub
     Pages serves everything over HTTPS by default, so this is already satisfied.
   - The very first time you open the site, it needs a live connection so the
     browser can register the service worker and cache the app shell. After that
     first successful visit, it will keep working offline.

4. If you ever rename the repository (which changes the subpath), no code changes
   are needed — everything resolves relative to wherever `index.html` actually lives.

## If something doesn't look right

- If the Home Screen icon looks wrong or blank: double check the `icons/` folder was
  uploaded alongside `index.html` and `manifest.json`, in the same directory.
- If "Add to Home Screen" doesn't offer the custom name/icon: fully close Safari and
  reopen the page fresh (Safari can cache an old, icon-less version of a page you'd
  visited before these changes existed).
- If you update the app later and it seems to keep showing the *old* version once
  installed: bump `CACHE_VERSION` at the top of `service-worker.js` to a new value
  (e.g. `"v2"`) — this forces the service worker to fetch fresh files instead of
  serving what it cached before.
