const CACHE = 'gym-v2';
const ASSETS = [
  './', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'gif/0CXGHya.gif',
  'gif/10Z2DXU.gif',
  'gif/17lJ1kr.gif',
  'gif/2dImyQ8.gif',
  'gif/2NpxjC1.gif',
  'gif/3ZflifB.gif',
  'gif/4Ml7QFO.gif',
  'gif/5v7KYld.gif',
  'gif/6kSxYnw.gif',
  'gif/6TG6x2w.gif',
  'gif/7F1DVzn.gif',
  'gif/7I6LNUG.gif',
  'gif/deadhang.gif',
  'gif/DOoWcnA.gif',
  'gif/DsgkuIt.gif',
  'gif/dU605di.gif',
  'gif/fUBheHs.gif',
  'gif/G08RZcQ.gif',
  'gif/HPlPoQA.gif',
  'gif/IGjKj1v.gif',
  'gif/my33uHU.gif',
  'gif/Qa55kX1.gif',
  'gif/qdRxqCj.gif',
  'gif/qPEzJjA.gif',
  'gif/rjiM4L3.gif',
  'gif/rR0LJzx.gif',
  'gif/RRWFUcw.gif',
  'gif/trqKQv2.gif',
  'gif/v3xmPAR.gif',
  'gif/vqsbmL0.gif',
  'gif/wEulIzp.gif',
  'gif/WW95auq.gif',
  'gif/yz9nUhF.gif',
  'gif/Zg3XY7P.gif',
  'gif/zhMwOwE.gif',
  'gif/znQUdHY.gif'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Код — сначала из сети (чтобы обновления доходили), картинки — из кэша.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.gif') || url.pathname.endsWith('.png')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});