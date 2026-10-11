// Service worker: deixa o Caderno funcionar sem internet.
// Estratégia: rede primeiro (sempre a versão mais nova quando há internet), com a cópia
// guardada como reserva sem internet. Não mexe nas chamadas ao Google.
const VERSION = 'caderno-v32';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './fonts/PlaypenSans.ttf',
  './js/app.js',
  './js/util.js',
  './js/store.js',
  './js/events.js',
  './js/codec.js',
  './js/ui.js',
  './js/icons.js',
  './js/weather.js',
  './js/views/hoje.js',
  './js/views/mes.js',
  './js/views/rotina.js',
  './js/views/tarefas.js',
  './js/views/ajustes.js',
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
  // ícones e manifesto ficam fora do service worker: o iOS busca o ícone da tela de início direto da rede
  if (/\.(png|webmanifest|json)$/.test(url.pathname)) return;

  // fonte e ícones quase nunca mudam: cópia guardada primeiro
  const stable = /\/(fonts|icons)\//.test(url.pathname);

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      if (stable) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
      }
      // o resto (página, código, estilos): rede primeiro, para sempre abrir a versão mais nova.
      // Sem internet (ou rede lenta demais), usa a cópia guardada.
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { cache: 'no-cache', signal: ctrl.signal });
        clearTimeout(timer);
        if (res && res.ok) {
          cache.put(req, res.clone());
          return res;
        }
      } catch {}
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })
  );
});
