const prefix = 'inboxai-send-v1:'

// The older composer persisted a hash and a key for uncertain sends in this tab.
export async function readLegacyComposeAttempt(payload: string) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
    const fingerprint = prefix + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const key = sessionStorage.getItem(fingerprint)
    return key ? { key, clear: () => sessionStorage.removeItem(fingerprint) } : null
  } catch {
    return null
  }
}
