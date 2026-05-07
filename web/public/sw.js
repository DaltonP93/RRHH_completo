// SisHoras Service Worker — cache estático + network-first para navegación
//
// Reglas:
// - NUNCA cachear /api/*, /socket.io/*, /uploads/* (datos sensibles).
// - Rutas /marcar y /mi-asistencia NO se cachean para evitar mostrar marcajes desactualizados.
// - El cache name versionado (sishoras-v2) fuerza invalidación tras deploy.
const CACHE = 'sishoras-v2'
const STATIC_ASSETS = ['/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // ── Lista negra: nunca cachear ──────────────────────────────
  if (url.pathname.startsWith('/api/'))         return
  if (url.pathname.startsWith('/socket.io/'))   return
  if (url.pathname.startsWith('/uploads/'))     return
  // Páginas con datos sensibles en tiempo real
  if (url.pathname === '/marcar')               return
  if (url.pathname === '/mi-asistencia')        return
  if (url.pathname.startsWith('/dashboard'))    return

  // ── Solo cachear GETs ───────────────────────────────────────
  if (e.request.method !== 'GET') return

  // ── Navegaciones: network-first con fallback a cache ────────
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    )
    return
  }

  // ── Otros recursos estáticos: cache-first con revalidación ──
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        // No cachear respuestas con Authorization (datos del usuario)
        if (res.ok && !e.request.headers.get('authorization')) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      }).catch(() => hit)
    )
  )
})

// Web Push (placeholder — requiere VAPID en backend)
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch {}
  const title = data.title || 'SisHoras'
  const body  = data.body  || 'Nueva notificación'
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: data.url || '/',
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.openWindow(e.notification.data || '/'))
})
