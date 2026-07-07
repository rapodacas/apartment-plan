// Service Worker for Apartment Build PWA — handles push notifications

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Handle push notification
self.addEventListener('push', e => {
  let data = { title: 'Apartment Build', body: 'New signup', date: '' };
  try { data = e.data.json(); } catch (err) {}

  const options = {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'worker-signup-' + (data.date || Date.now()),
    renotify: true,
    data: { date: data.date, url: '/apartment-plan/' }
  };

  e.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click — open app and scroll to day
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/apartment-plan/';
  const date = e.notification.data?.date || '';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes('apartment-plan')) {
          client.focus();
          client.postMessage({ type: 'SCROLL_TO_DAY', date });
          return;
        }
      }
      // Otherwise open new tab
      return self.clients.openWindow(url + (date ? '#day-' + date : ''));
    })
  );
});
