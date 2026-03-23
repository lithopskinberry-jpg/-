const CACHE_NAME = 'dcg-v2';

const MUST_CACHE = [
  './',
  './dcg.html',
  './cards.js',
];

// カード画像 c1〜c120（存在しないものは無視）
const CARD_IMAGES = Array.from({length: 120}, (_, i) => `./card/c${i + 1}.jpg`);

// インストール時：必須ファイルは確実に、画像は失敗を無視してキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // 必須ファイルは確実にキャッシュ（失敗したらエラー）
      await cache.addAll(MUST_CACHE);

      // 画像は1枚ずつ試みて、失敗しても無視して続行
      await Promise.allSettled(
        CARD_IMAGES.map(url =>
          fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      );
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
