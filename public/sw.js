// KS Precision Cleaning service worker.
// Pages come from the network (data must be live). Pages staff use in the field (dashboard,
// check-in, jobs, hours) are also kept on the phone after each visit, so they still open with no
// signal; actions taken there are saved on the phone and sent later (src/lib/offline.ts).
// Other pages show the offline page. Static assets are cached. Phone notifications arrive here.
const CACHE = "ks-v2";
const PAGES = "ks-pages-v1";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
const FIELD = /^\/(dashboard|checkin|jobs(\/[^/]+)?|time|timeoff)\/?$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PAGES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// The sign-in page asks us to forget saved pages, so the next person on this phone can't see them.
self.addEventListener("message", (e) => {
  if (e.data === "clear-pages") e.waitUntil(caches.delete(PAGES));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // never touch check-ins, saves or logins
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    const keep = FIELD.test(url.pathname);
    e.respondWith(fetch(req).then((res) => {
      if (keep && res.ok && !res.redirected) { const copy = res.clone(); caches.open(PAGES).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(async () => (keep && (await caches.match(url.pathname, { cacheName: PAGES }))) || caches.match(OFFLINE)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    })));
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "KS Precision Cleaning", {
    body: d.body || "", tag: d.tag, data: { url: d.url || "/notifications" }, icon: "/icon-192.png", badge: "/icon-192.png",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/notifications";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
