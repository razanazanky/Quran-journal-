// Service worker for "My Quran Journal — The Light of My Heart"
//
// Goals:
//  - Let the app be added to the Home Screen and opened without a browser chrome.
//  - Make the app shell (index.html + icons + manifest) available offline after the first visit.
//  - Never touch or interfere with the app's own data (it stores everything in
//    localStorage, which service workers do not have access to and cannot clear).
//  - Work correctly no matter what path this is hosted under (root domain or a
//    GitHub Pages project subpath like /repo-name/), by using only paths that are
//    relative to this file's own location.

const CACHE_VERSION = "v1";
const CACHE_NAME = "quran-journal-" + CACHE_VERSION;

// Resolve the app shell URLs relative to this service worker's own location so this
// works whether the site lives at the domain root or under a GitHub Pages subpath.
const SCOPE_URL = self.registration ? self.registration.scope : self.location.href;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-48.png",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-167.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-256.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
].map((p) => new URL(p, SCOPE_URL).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => {
        // Don't let a single missing/renamed asset block installation entirely.
        console.warn("Service worker: app shell caching had an issue:", err);
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle simple GET requests; let everything else (POST, etc.) pass straight through.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Page navigations: try the network first (so updates are picked up), and fall
  // back to the cached app shell when there's no connection.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  if (isSameOrigin) {
    // App shell assets: cache-first for instant, offline-friendly loads.
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Cross-origin requests (the live Quran text API, Google Fonts, etc.): try the
  // network first for fresh/accurate content, and fall back to a cached copy if
  // one exists and the network is unavailable. The app itself also caches fetched
  // surah text in localStorage, so this is a second, complementary layer.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
