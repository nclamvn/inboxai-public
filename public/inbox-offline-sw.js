/* global self, caches */
const prefix = 'inboxai-offline-shell-'
const version = prefix + '2'
const shell = '/offline-workspace/index.html'
const assets = [
  shell, '/offline-workspace/workspace.mjs', '/offline-workspace/storage.mjs', '/offline-workspace/workspace.css',
  '/offline-workspace/compose.mjs', '/offline-workspace/compose-editor.mjs',
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
  if (request.mode !== 'navigate' || !['/inbox', '/compose', '/drafts'].includes(url.pathname)) return
  event.respondWith(fetch(request).catch(() => {
    const target = new URL(shell, url)
    const selectors = url.pathname === '/compose'
      ? [['reply', url.searchParams.get('reply') ?? url.searchParams.get('replyToEmailId')],
        ['compose', url.searchParams.get('offlineDraft')], ['draft', url.searchParams.get('draft')],
        ['forward', url.searchParams.get('forward')]]
      : [['email', url.searchParams.get('email')]]
    const selection = selectors.find(([, id]) => id && /^[0-9a-f-]{36}$/i.test(id))
    if (selection) target.searchParams.set(...selection)
    return Response.redirect(target, 302)
  }))
})
