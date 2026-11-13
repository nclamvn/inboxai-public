'use client'

import { useEffect, useEffectEvent } from 'react'

export function useDraftAutosave(enabled: boolean, snapshot: string, save: () => void) {
  const saveCurrent = useEffectEvent(save)
  useEffect(() => {
    if (!enabled) return
    const timeout = window.setTimeout(() => saveCurrent(), 1100)
    return () => window.clearTimeout(timeout)
  }, [enabled, snapshot])
}
