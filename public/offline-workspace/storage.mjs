import { validateDraftFiles } from './compose.mjs'

const databaseName = 'inboxai-offline-v1'
const ownerKey = 'active'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const maximumEntries = 64
const maximumBytes = 2_000_000
const maximumComposeBytes = 32 * 1024 * 1024
const scopeChanged = new EventTarget()

function request(result) {
  return new Promise((resolve, reject) => {
    result.onsuccess = () => resolve(result.result)
    result.onerror = () => reject(result.error)
  })
}

async function transaction(mode, run) {
  const opening = indexedDB.open(databaseName, 2)
  opening.onupgradeneeded = event => {
    if (event.oldVersion === 0) {
      opening.result.createObjectStore('scope')
      opening.result.createObjectStore('entries', { keyPath: 'key' })
    }
    opening.result.createObjectStore('compose-files', { keyPath: 'key' })
  }
  const db = await request(opening)
  try {
    const tx = db.transaction(['scope', 'entries', 'compose-files'], mode)
    const finished = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('Không lưu được dữ liệu trên thiết bị.'))
    })
    try {
      const result = await run(tx.objectStore('scope'), tx.objectStore('entries'), tx.objectStore('compose-files'))
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
  const changed = await transaction('readwrite', async (scopes, entries, files) => {
    const current = await request(scopes.get(ownerKey))
    if (current?.owner === owner) return false
    await request(entries.clear())
    await request(files.clear())
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
  const changed = await transaction('readwrite', async (scopes, entries, files) => {
    const current = await request(scopes.get(ownerKey))
    if (!current || (owner && current.owner !== owner)) return false
    await request(entries.clear())
    await request(files.clear())
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
  return encrypt(key, scope, label, bytes)
}

async function encrypt(key, scope, label, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(scope, label) }, key, bytes)
  return { iv, ciphertext }
}

async function unseal(key, scope, label, entry) {
  return JSON.parse(decoder.decode(await decrypt(key, scope, label, entry)))
}

function decrypt(key, scope, label, entry) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: entry.iv, additionalData: additionalData(scope, label) }, key, entry.ciphertext,
  )
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
  const checked = (mode, operation) => transaction(mode, async (scopes, entries, files) => {
    verify(await request(scopes.get(ownerKey)))
    return operation(entries, files)
  })
  const entryKey = (kind, source) => kind + ':' + source
  const composeRange = IDBKeyRange.bound('compose:', 'compose;', false, true)
  const composeKey = id => 'compose:' + id
  const fileKey = (id, fileId) => composeKey(id) + ':' + fileId
  function checkVersion(current, expected) {
    if ((current?.version ?? null) !== expected) {
      throw new Error('Bản nháp trên thiết bị đã thay đổi ở cửa sổ khác. Hãy mở lại bản đã lưu.')
    }
  }
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
    findCompose(draftId, sourceId) {
      return queue(async () => {
        const records = await checked('readonly', entries => request(entries.getAll(composeRange)))
        for (const entry of records) {
          const value = await unseal(key, scope, entry.key, entry)
          if (draftId ? value.draftId === draftId : sourceId && !value.draftId && value.sourceId === sourceId) {
            return entry.key.slice('compose:'.length)
          }
        }
        return null
      })
    },
    getCompose(id) {
      return queue(async () => {
        const label = composeKey(id)
        const entry = await checked('readonly', entries => request(entries.get(label)))
        return entry ? { version: entry.version, value: await unseal(key, scope, label, entry) } : null
      })
    },
    saveCompose(id, expected, value, added = []) {
      return queue(async () => {
        validateDraftFiles(value.files)
        const label = composeKey(id)
        const version = crypto.randomUUID()
        const protectedEntry = await seal(key, scope, label, value)
        const local = value.files.filter(file => file.local)
        const localKeys = local.map(file => fileKey(id, file.id))
        const size = local.reduce((sum, file) => sum + file.size, 0)
        const uploads = await Promise.all(added.map(async ({ file, bytes }) => {
          const label = fileKey(id, file.id)
          if (!localKeys.includes(label) || bytes.size !== file.size) throw new Error('Tệp không khớp bản nháp.')
          return { key: label, ...await encrypt(key, scope, label, await bytes.arrayBuffer()) }
        }))
        await checked('readwrite', async (entries, files) => {
          const current = await request(entries.get(label))
          checkVersion(current, expected)
          if (!current && await request(entries.count()) >= maximumEntries) {
            throw new Error('Đã đầy vùng lưu ngoại tuyến. Hãy bỏ bớt thư hoặc bản nháp đã lưu.')
          }
          if (size > (current?.size ?? 0)) {
            const drafts = await request(entries.getAll(composeRange))
            const occupied = drafts.reduce((sum, entry) => sum + (entry.key === label ? 0 : entry.size), 0)
            if (occupied + size > maximumComposeBytes) throw new Error('Thiết bị đã dùng hết 32 MB cho tệp bản nháp.')
          }
          for (const upload of uploads) await request(files.put(upload))
          for (const key of localKeys) {
            if (!await request(files.getKey(key))) throw new Error('Thiếu tệp đính kèm trên thiết bị.')
          }
          for (const key of current?.fileKeys ?? []) {
            if (!localKeys.includes(key)) await request(files.delete(key))
          }
          await request(entries.put({ key: label, version, size, fileKeys: localKeys, ...protectedEntry }))
        })
        return version
      })
    },
    getComposeFile(id, fileId) {
      return queue(async () => {
        const label = fileKey(id, fileId)
        const entry = await checked('readonly', (_, files) => request(files.get(label)))
        if (!entry) throw new Error('Tệp không còn trên thiết bị.')
        return decrypt(key, scope, label, entry)
      })
    },
    removeCompose(id, expected) {
      return queue(() => checked('readwrite', async (entries, files) => {
        const label = composeKey(id)
        const current = await request(entries.get(label))
        checkVersion(current, expected)
        for (const key of current?.fileKeys ?? []) await request(files.delete(key))
        await request(entries.delete(label))
      }))
    },
    list() {
      return queue(async () => {
        const items = await checked('readonly', entries => request(entries.getAll()))
        return Promise.all(items.map(async entry => {
          const [kind, source] = entry.key.split(':')
          return { kind, source, version: entry.version, value: await unseal(key, scope, entry.key, entry) }
        }))
      })
    },
  }
}
