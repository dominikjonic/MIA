// Minimaler Service Worker: App-Hülle offline verfügbar, Daten immer frisch aus dem Netz.
const CACHE = "dom-v4";
const SHELL = ["./", "index.html", "css/tokens.css", "css/app.css", "vendor/supabase.js", "js/app.js", "js/ui.js", "js/icons.js", "js/supa.js", "js/config.js", "icons/logo-mark.png", "css/design.css", "js/motion.js", "fonts/Geist-Variable.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Netzwerk zuerst, Cache als Rückfall
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request)));
});
