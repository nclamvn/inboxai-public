/* global self, caches */
const prefix = 'inboxai-offline-shell-'
const version = prefix + '1'
const shell = '/offline-workspace/index.html'
const assets = [
  shell, '/offline-workspace/workspace.mjs', '/offline-workspace/storage.mjs', '/offline-workspace/workspace.css',
  ...['latin', 'latin-ext', 'vietnamese'].map(subset => '/offline-workspace/fonts/inter-' + subset + '-wght-normal.woff2'),
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll(assets.map(path =>
    new Request(path, { cache: 'reload', credentials: 'omit' }),
  ))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== version)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || request.method !== 'GET') return
  if (assets.includes(url.pathname)) {
    event.respondWith(caches.open(version).then(cache => cache.match(url.pathname)).then(response => response || fetch(request)))
    return
  }
  if (request.mode !== 'navigate' || !['/inbox', '/compose'].includes(url.pathname)) return
  const reply = url.searchParams.get('reply') ?? url.searchParams.get('replyToEmailId')
  if (url.pathname === '/compose' && !reply) return
  event.respondWith(fetch(request).catch(() => {
    const target = new URL(shell, url)
    const id = url.pathname === '/compose' ? reply : url.searchParams.get('email')
    if (id && /^[0-9a-f-]{36}$/i.test(id)) target.searchParams.set(url.pathname === '/compose' ? 'reply' : 'email', id)
    return Response.redirect(target, 302)
  }))
})
