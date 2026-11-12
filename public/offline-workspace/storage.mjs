const databaseName = 'inboxai-offline-v1'
const ownerKey = 'active'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const maximumEntries = 64
const maximumBytes = 2_000_000
const scopeChanged = new EventTarget()

function request(result) {
  return new Promise((resolve, reject) => {
    result.onsuccess = () => resolve(result.result)
    result.onerror = () => reject(result.error)
  })
}

async function transaction(mode, run) {
  const opening = indexedDB.open(databaseName, 1)
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore('scope')
    opening.result.createObjectStore('entries', { keyPath: 'key' })
  }
  const db = await request(opening)
  try {
    const tx = db.transaction(['scope', 'entries'], mode)
    const finished = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('Không lưu được dữ liệu trên thiết bị.'))
    })
    try {
      const result = await run(tx.objectStore('scope'), tx.objectStore('entries'))
      await finished
      return result
    } catch (error) {
      try { tx.abort() } catch { /* Already committed or aborted. */ }
      await finished.catch(() => {})
      throw error
    }
  } finally {
    db.close()
  }
}

function signalScopeChange() {
  scopeChanged.dispatchEvent(new Event('change'))
  // The signal carries no user data or key.
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(databaseName)
    channel.postMessage('change')
    channel.close()
  }
}

export function watchOfflineScope(callback) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(databaseName) : null
  scopeChanged.addEventListener('change', callback)
  if (channel) channel.onmessage = callback
  return () => {
    scopeChanged.removeEventListener('change', callback)
    channel?.close()
  }
}

export async function offlineScope() {
  const scope = await transaction('readonly', scopes => request(scopes.get(ownerKey)))
  return scope ? { owner: scope.owner, epoch: scope.epoch, enrolled: Boolean(scope.verifier) } : null
}

// The online app calls this only with the user verified by its server layout.
export async function selectOfflineOwner(owner) {
  const changed = await transaction('readwrite', async (scopes, entries) => {
    const current = await request(scopes.get(ownerKey))
    if (current?.owner === owner) return false
    await request(entries.clear())
    await request(scopes.put({ owner, epoch: crypto.randomUUID() }, ownerKey))
    return true
  })
  if (changed) signalScopeChange()
  return offlineScope()
}

export function hasOfflineDraft(owner, source) {
  return transaction('readonly', async (scopes, entries) => {
    const current = await request(scopes.get(ownerKey))
    return current?.owner === owner && Boolean(await request(entries.getKey('draft:' + source)))
  })
}

export async function clearOfflineVault(owner) {
  const changed = await transaction('readwrite', async (scopes, entries) => {
    const current = await request(scopes.get(ownerKey))
    if (!current || (owner && current.owner !== owner)) return false
    await request(entries.clear())
    await request(scopes.delete(ownerKey))
    return true
  })
  if (changed) signalScopeChange()
}

async function derive(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function additionalData(scope, label) {
  return encoder.encode(JSON.stringify([databaseName, scope.owner, scope.epoch, label]))
}

async function seal(key, scope, label, value) {
  const bytes = encoder.encode(JSON.stringify(value))
  if (bytes.length > maximumBytes) throw new Error('Nội dung vượt giới hạn lưu trên thiết bị.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(scope, label) }, key, bytes)
  return { iv, ciphertext }
}

async function unseal(key, scope, label, entry) {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: entry.iv, additionalData: additionalData(scope, label) }, key, entry.ciphertext,
  )
  return JSON.parse(decoder.decode(bytes))
}

export async function openOfflineVault(owner, passphrase, enroll = false) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 128) {
    throw new Error('Mật khẩu ngoại tuyến cần từ 12 đến 128 ký tự.')
  }
  const scope = await transaction('readonly', scopes => request(scopes.get(ownerKey)))
  if (!scope || scope.owner !== owner || (!scope.verifier && !enroll)) {
    throw new Error('Hãy bật lưu ngoại tuyến từ Hộp thư khi có mạng.')
  }
  const salt = scope.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const key = await derive(passphrase, salt)
  function verify(current) {
    if (current?.owner !== scope.owner || current.epoch !== scope.epoch) {
      throw new Error('Phiên lưu ngoại tuyến trên thiết bị đã thay đổi.')
    }
  }
  if (scope.verifier) {
    try {
      if (await unseal(key, scope, 'verifier', scope.verifier) !== databaseName) throw new Error()
    } catch {
      throw new Error('Mật khẩu ngoại tuyến chưa đúng.')
    }
  } else {
    const verifier = await seal(key, scope, 'verifier', databaseName)
    await transaction('readwrite', async scopes => {
      const current = await request(scopes.get(ownerKey))
      verify(current)
      if (current.verifier) throw new Error('Kho đã được bật trong cửa sổ khác. Hãy mở khóa lại.')
      await request(scopes.put({ ...scope, salt, verifier }, ownerKey))
    })
  }
  await transaction('readonly', async scopes => verify(await request(scopes.get(ownerKey))))

  let pending = Promise.resolve()
  const queue = operation => {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }
  const checked = (mode, operation) => transaction(mode, async (scopes, entries) => {
    verify(await request(scopes.get(ownerKey)))
    return operation(entries)
  })
  const entryKey = (kind, source) => kind + ':' + source
  return {
    owner,
    epoch: scope.epoch,
    get(kind, source) {
      return queue(async () => {
        const label = entryKey(kind, source)
        const entry = await checked('readonly', entries => request(entries.get(label)))
        return entry ? unseal(key, scope, label, entry) : null
      })
    },
    put(kind, source, value) {
      return queue(async () => {
        const label = entryKey(kind, source)
        const protectedEntry = await seal(key, scope, label, value)
        await checked('readwrite', async entries => {
          if (await request(entries.count()) >= maximumEntries && !await request(entries.getKey(label))) {
            throw new Error('Đã đầy vùng lưu ngoại tuyến. Hãy bỏ bớt thư hoặc bản nháp đã lưu.')
          }
          await request(entries.put({ key: label, ...protectedEntry }))
        })
      })
    },
    remove(kind, source) {
      return queue(() => checked('readwrite', entries => request(entries.delete(entryKey(kind, source)))))
    },
    list() {
      return queue(async () => {
        const items = await checked('readonly', entries => request(entries.getAll()))
        return Promise.all(items.map(async entry => {
          const [kind, source] = entry.key.split(':')
          return { kind, source, value: await unseal(key, scope, entry.key, entry) }
        }))
      })
    },
  }
}
