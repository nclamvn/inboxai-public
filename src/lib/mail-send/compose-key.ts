const prefix = 'inboxai-send-v1:'

/** Retain only a draft fingerprint and its key in this tab across reloads. */
export async function composeFingerprint(body: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return prefix + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function readComposeKey(fingerprint: string) {
  try { return sessionStorage.getItem(fingerprint) } catch { return null }
}

export function saveComposeKey(fingerprint: string, key: string | null) {
  try {
    if (key) sessionStorage.setItem(fingerprint, key)
    else sessionStorage.removeItem(fingerprint)
  } catch { /* The compose view still retains its in-memory key. */ }
}
