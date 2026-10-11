// Service worker: deixa o Caderno funcionar sem internet.
// Estratégia: responde na hora com a cópia guardada e atualiza em segundo plano
// (a versão nova aparece na abertura seguinte). Não mexe nas chamadas ao Google.
const VERSION = 'caderno-v11';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/PlaypenSans.ttf',
  './js/app.js',
  './js/util.js',
  './js/store.js',
  './js/events.js',
  './js/codec.js',
  './js/ui.js',
  './js/icons.js',
  './js/views/hoje.js',
  './js/views/mes.js',
  './js/views/rotina.js',
  './js/views/tarefas.js',
  './js/views/ajustes.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Agenda etc.: direto na rede

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(fresh);
        return cached;
      }
      const res = await fresh;
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })
  );
});
