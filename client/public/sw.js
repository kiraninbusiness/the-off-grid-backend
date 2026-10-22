/*
  The Off Grid
  Service worker disabled.

  The application is intentionally not cached here.
  This prevents stale HTML/JS from causing the site to
  appear only after a manual refresh during deployments.
*/

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", () => {
  // Intentionally do nothing.
  // Requests use the browser/network normally.
});
