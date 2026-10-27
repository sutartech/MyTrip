"use strict";

const STATIC_CACHE = "mytrip-static-v4.67.13";
const VERSIONED_ASSETS = [
  "./index.html",
  "./app.css?v=4.67.13",
  "./app.js?v=4.67.13",
  "./favicon.svg", "./manifest.webmanifest", "./apple-touch-icon.png",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./quick-expense-icon.svg", "./quick-expense-icon-192.png", "./quick-expense-icon-512.png", "./quick-expense-install.html", "./quick-expense.webmanifest",
  "./repair.html", "./quick-expense/index.html", "./quick-expense/install.html", "./quick-expense/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => Promise.all(VERSIONED_ASSETS.map((asset) => cache.add(asset).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mytrip-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function navigationResponse(event) {
  const request = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const pathname = new URL(request.url).pathname;
  const key = pathname.endsWith('/quick-expense/install.html') ? './quick-expense/install.html' : pathname.endsWith('/quick-expense/index.html') || pathname.endsWith('/quick-expense/') ? './quick-expense/index.html' : pathname.endsWith('/quick-expense-install.html') ? './quick-expense-install.html' : pathname.endsWith('/repair.html') ? './repair.html' : './index.html';
  const cached = await cache.match(key);
  const update = fetch(request).then(async response => { if (response?.ok) await cache.put(key, response.clone()); return response; });
  if (cached) { event.waitUntil(update.catch(() => {})); return cached; }
  try {
    const response = await Promise.race([
      update,
      new Promise((_, reject) => setTimeout(() => reject(new Error("navigation timeout")), 8000))
    ]);
    return response;
  } catch {
    return cached || Response.error();
  }
}

/* app.js and app\.css are fetched fresh first: a stale copy on a slow mobile
   link used to keep the old build running for days. Everything else stays
   cache-first for speed. */
async function staticResponse(event, freshFirst) {
  const request = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  // Versioned assets are immutable by URL: render the cached build immediately.
  if (cached && new URL(request.url).searchParams.has("v")) { event.waitUntil(fresh); return cached; }
  if (freshFirst) return (await fresh) || cached || Response.error();
  return cached || fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(event));
    return;
  }
  if (url.pathname.endsWith("/config.js")) return;
  if (/\.(?:css|js|svg|png|webp|html|gz|wasm)$/.test(url.pathname)) {
    const freshFirst = /\.(?:js|css|html)$/.test(url.pathname) && !/\/ocr\//.test(url.pathname);
    event.respondWith(staticResponse(event, freshFirst));
  }
});
