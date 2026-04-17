// Lead4Producers Service Worker
const CACHE = 'l4p-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Network-first, fallback to cache for offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  // Skip API calls and auth
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data')) return

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request).then(r => r || new Response('Offline', { status: 503 })))
  )
})

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Lead4Producers', body: 'Nova atividade', url: '/dashboard' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (e) {
    if (event.data) data.body = event.data.text()
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/dashboard' },
    tag: data.tag || 'l4p-notif',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in c) return c.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
