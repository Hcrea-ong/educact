const VERSION = 'educact-v2';
const CORE = ['./', './index.html', './manifest.json'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // Une bibliothèque CDN indisponible ne doit pas faire échouer l'installation
    await Promise.all(LIBS.map((u) => cache.add(u).catch(() => {})));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Ne jamais mettre en cache l'API (Supabase) ni les autres domaines
  if (url.origin !== location.origin && !LIBS.includes(req.url)) return;

  // Pages et fichiers de l'app : réseau d'abord, cache en secours (mises à jour visibles)
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true })) ||
               (req.mode === 'navigate' ? await caches.match('./index.html') : Response.error());
      }
    })());
    return;
  }
  // Bibliothèques CDN : cache d'abord
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
    return res;
  })));
});
