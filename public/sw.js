const CACHE = 'stcrm-v14';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'helpers.js', 'config.js', 'manifest.json', 'icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// network first for our own files (so updates arrive), cache as fallback; never touch Supabase/CDN calls
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ---- follow-up reminders (web push) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Stand Tall CRM', body: e.data ? e.data.text() : '' }; }
  const isLead = d.tag === 'newlead';
  e.waitUntil(Promise.all([
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: isLead ? 'newlead' : 'push' }))),
    self.registration.showNotification(d.title || 'Stand Tall CRM', {
    body: d.body || '',
    renotify: isLead,
    tag: d.tag || undefined,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    requireInteraction: true,
    vibrate: isLead ? [500, 200, 500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    data: { url: './' },
  })]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
