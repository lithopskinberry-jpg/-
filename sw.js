const CACHE_NAME = 'dcg-v1';

const FILES_TO_CACHE = [
  './',
  './dcg_new.html',
  './card/c1.jpg',
  './card/c2.jpg',
  './card/c3.jpg',
  './card/c4.jpg',
  './card/c5.jpg',
  './card/c6.jpg',
  './card/c7.jpg',
  './card/c8.jpg',
  './card/c9.jpg',
  './card/c10.jpg',
  './card/c11.jpg',
  './card/c12.jpg',
  './card/c13.jpg',
  './card/c14.jpg',
  './card/c15.jpg',
  './card/c16.jpg',
  './card/c17.jpg',
  './card/c18.jpg',
  './card/c19.jpg',
  './card/c20.jpg',
  './card/c21.jpg',
  './card/c22.jpg',
  './card/c23.jpg',
  './card/c24.jpg',
  './card/c25.jpg',
  './card/c26.jpg',
  './card/c27.jpg',
  './card/c28.jpg',
  './card/c29.jpg',
  './card/c30.jpg',
  './card/c31.jpg',
  './card/c32.jpg',
  './card/c33.jpg',
  './card/c34.jpg',
  './card/c35.jpg',
  './card/c36.jpg',
  './card/c37.jpg',
  './card/c38.jpg',
  './card/c39.jpg',
  './card/c40.jpg',
  './card/c41.jpg',
  './card/c42.jpg',
  './card/c43.jpg',
  './card/c44.jpg',
  './card/c45.jpg',
  './card/c46.jpg',
  './card/c47.jpg',
  './card/c48.jpg',
  './card/c49.jpg',
  './card/c50.jpg',
  './card/c51.jpg',
  './card/c52.jpg',
  './card/c53.jpg',
  './card/c54.jpg',
  './card/c55.jpg',
  './card/c56.jpg',
  './card/c57.jpg',
  './card/c58.jpg',
  './card/c59.jpg',
  './card/c60.jpg',
  './card/c61.jpg',
  './card/c62.jpg',
  './card/c63.jpg',
  './card/c64.jpg',
  './card/c65.jpg',
  './card/c66.jpg',
  './card/c67.jpg',
  './card/c68.jpg',
  './card/c69.jpg',
  './card/c70.jpg',
  './card/c71.jpg',
  './card/c72.jpg',
  './card/c73.jpg',
  './card/c74.jpg',
  './card/c75.jpg',
  './card/c76.jpg',
  './card/c77.jpg',
  './card/c78.jpg',
  './card/c79.jpg',
  './card/c80.jpg',
  './card/c81.jpg',
  './card/c82.jpg',
  './card/c83.jpg',
  './card/c84.jpg',
  './card/c85.jpg',
  './card/c86.jpg',
];

// インストール時：全ファイルをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// リクエスト時：キャッシュ優先、なければネットワーク
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
