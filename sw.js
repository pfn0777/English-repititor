// EnglishBot service worker.
// Maqsad: internetsiz ham ilova ochilsin va LOKAL qismlar ishlasin —
// mavzu darsi (so'zlar + grammatika) va lug'at takrorlash (SRS) tarmoqqa muhtoj emas.
// AI vazifalari baribir internet talab qiladi; ular keshlanmaydi.

const VERSION = 'eb-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE = `${VERSION}-cdn`;
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await c.addAll(SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase (AI, progress, admin) — hech qachon keshlanmaydi.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Sahifaning o'zi: avval tarmoq (yangilanish yo'qolmasin), keyin kesh.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL_CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch (_e) {
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Tailwind CDN va shunga o'xshash statik resurs: avval kesh, fonda yangilanadi.
  // Aks holda internetsiz ilova butunlay stilsiz ochiladi.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const c = await caches.open(CDN_CACHE);
        c.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});
