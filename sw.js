"use strict";

const STATIC_CACHE = "mytrip-static-v4.20.2";
const VERSIONED_ASSETS = [
  "./index.html",
  "./styles.css?v=4.20.2",
  "./app.js?v=4.20.2",
  "./favicon.svg",
  "./repair.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => Promise.all(VERSIONED_ASSETS.map((asset) => cache.add(asset).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mytrip-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function navigationResponse(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("navigation timeout")), 8000))
    ]);
    if (response && response.ok) await cache.put("./index.html", response.clone());
    return response;
  } catch {
    return (await cache.match("./index.html")) || Response.error();
  }
}

/* app.js and styles.css are fetched fresh first: a stale copy on a slow mobile
   link used to keep the old build running for days. Everything else stays
   cache-first for speed. */
async function staticResponse(request, freshFirst) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  if (freshFirst) return (await fresh) || cached || Response.error();
  return cached || fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.pathname.endsWith("/config.js")) return;
  if (/\.(?:css|js|svg|png|webp|html)$/.test(url.pathname)) {
    const freshFirst = /\/(?:app\.js|styles\.css)$/.test(url.pathname);
    event.respondWith(staticResponse(request, freshFirst));
  }
});
