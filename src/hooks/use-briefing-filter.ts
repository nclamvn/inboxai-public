'use client'

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

export interface BriefingFilter { type: string; title: string; emailIds: string[] }
const changed = 'inboxai:briefing-filter-changed'
const serverSnapshot = () => null
const snapshot = () => {
  try { return sessionStorage.getItem('briefing_filter') } catch { return null }
}
function subscribe(notify: () => void) {
  window.addEventListener('storage', notify)
  window.addEventListener(changed, notify)
  return () => {
    window.removeEventListener('storage', notify)
    window.removeEventListener(changed, notify)
  }
}

/** Session storage is an external source; keep the server/hydration snapshot empty. */
export function useBriefingFilter(type: string | null) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const clear = useCallback(() => {
    try { sessionStorage.removeItem('briefing_filter') } catch { /* Storage can be unavailable. */ }
    window.dispatchEvent(new Event(changed))
  }, [])
  useEffect(() => { if (!type) clear() }, [type, clear])
  const filter = useMemo<BriefingFilter | null>(() => {
    if (!type || !raw || raw.length > 128 * 1024) return null
    try {
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object' || !('type' in value) || value.type !== type
        || !('title' in value) || typeof value.title !== 'string' || !('emailIds' in value)
        || !Array.isArray(value.emailIds) || !value.emailIds.every(id => typeof id === 'string')) return null
      return { type, title: value.title, emailIds: value.emailIds }
    } catch { return null }
  }, [type, raw])
  return { filter, clear }
}
