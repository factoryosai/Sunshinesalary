/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const CACHE_NAME = 'sunshine-pagarbook-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'सनशाइन पगार बुक', body: 'नया अपडेट उपलब्ध है!' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'सनशाइन पगार बुक', body: e.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: 'https://img.icons8.com/color/192/ledger.png',
    badge: 'https://img.icons8.com/color/48/ledger.png',
    vibrate: [100, 50, 100],
    data: {
      url: '/'
    }
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow('/')
  );
});
