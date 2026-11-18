// Offline-Start: App-Dateien zwischenspeichern, Daten kommen immer frisch von Supabase
const CACHE = 'kartentisch-6bc7d6c16f';
const SHELL = ['./', './index.html', './supabase-2.118.0.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './fonts/caveat-latin-500.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if (req.mode === 'navigate' || u.pathname === '/' || u.pathname.endsWith('/index.html')) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
