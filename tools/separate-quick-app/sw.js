"use strict";
// This app owns only its sibling /QuickExpense/ scope and its own cache.
const CACHE = "mytrip-quick-separate-v4.67.12";
const MAIN = "https://sutartech.github.io/MyTrip/";
const ROOT = new URL("./", self.location.href);
const LOCAL = ["index.html", "standalone.js?v=4.67.12", "standalone.css?v=4.67.12", "manifest.webmanifest", "quick-expense-icon.svg", "quick-expense-icon-192.png", "quick-expense-icon-512.png", "quick-expense-maskable-512.png"];
const SHARED = ["app.js?v=4.67.12", "app.css?v=4.67.12"].map(path => new URL(path, MAIN).href);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all([...LOCAL.map(path => new URL(path, ROOT).href), ...SHARED].map(url => cache.add(url).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("mytrip-quick-separate-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET") return;
  // Never intercept Google APIs, account/trip responses, receipts, or config.js.
  const own = url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname);
  const shared = SHARED.some(item => new URL(item).pathname === url.pathname && new URL(item).origin === url.origin);
  if (!own && !shared || /\/config\.js$/.test(url.pathname)) return;
  if (request.mode === "navigate" && own) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE), key = new URL("index.html", ROOT).href;
      const cached = await cache.match(key);
      const fresh = fetch(request).then(async response => { if (response.ok) await cache.put(key, response.clone()); return response; });
      if (cached) { event.waitUntil(fresh.catch(() => {})); return cached; }
      try { return await fresh; } catch { return Response.error(); }
    })());
    return;
  }
  if (!/\.(?:js|css|webmanifest|svg|png)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), cached = await cache.match(request);
    const fresh = fetch(request).then(async response => { if (response.ok) await cache.put(request, response.clone()); return response; });
    if (cached) { event.waitUntil(fresh.catch(() => {})); return cached; }
    try { return await fresh; } catch { return Response.error(); }
  })());
});
