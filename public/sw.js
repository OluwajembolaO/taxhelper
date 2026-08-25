/* TaxHelper service worker — offline shell + notification handling.
 *
 * Scope note: this worker can DISPLAY notifications and cache the app for
 * offline use. It cannot wake itself on a schedule — a 'push' event only fires
 * when a server sends one. See README § Notifications for that trade-off.
 */

const CACHE = 'taxhelper-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for everything precached, so an offline start does not depend on
// the network at all. Navigations fall back to the cached shell; anything not
// precached is fetched and cached opportunistically.
//
// Every branch resolves — a rejected respondWith() promise makes the browser
// fall through to the network, which is exactly what fails offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (request.mode === 'navigate') {
        // Try the network so a deployed update is picked up promptly, but never
        // let a failure surface: fall back to the precached document.
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            cache.put('/index.html', fresh.clone());
            return fresh;
          }
        } catch {
          /* offline — fall through to the cache */
        }
        return (
          (await cache.match('/index.html')) ||
          (await cache.match('/')) ||
          new Response('<h1>Offline</h1><p>Open TaxHelper once while online.</p>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        );
      }

      const hit = await cache.match(request, { ignoreVary: true });
      if (hit) return hit;

      try {
        const res = await fetch(request);
        if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline and not cached' });
      }
    })()
  );
});

// Server-sent push (only fires if you add a push backend — see README).
self.addEventListener('push', (event) => {
  let data = { title: 'TaxHelper', body: 'You have a payday reminder.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'taxhelper',
      data: { url: data.url || '/' },
    })
  );
});

// Tapping a notification focuses the existing window rather than opening a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
