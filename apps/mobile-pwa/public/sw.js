// App-shell service worker: precache the shell, network-first for navigations,
// cache-first for static assets, network-only for APIs.
const CACHE = 'bpm-pwa-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/bpm-logo-official.png', '/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/kc/')) return; // never cache API/auth
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
    const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return resp;
  }).catch(() => r)));
});
