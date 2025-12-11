'use client'

import { useCallback, useRef } from 'react'

type BehaviorAction = 'open' | 'read' | 'reply' | 'archive' | 'delete' | 'star' | 'unstar'

export function useBehaviorTracker() {
  // Track which emails have been tracked to avoid duplicates
  const trackedOpens = useRef<Set<string>>(new Set())

  const track = useCallback(async (
    emailId: string,
    action: BehaviorAction,
    readDuration?: number
  ) => {
    // Prevent duplicate open tracking
    if (action === 'open') {
      if (trackedOpens.current.has(emailId)) {
        return
      }
      trackedOpens.current.add(emailId)
    }

    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, action, readDuration })
      })
    } catch (error) {
      // Silent fail - tracking không nên block UI
      console.error('Tracking failed:', error)
    }
  }, [])

  const trackOpen = useCallback((emailId: string) => {
    track(emailId, 'open')
  }, [track])

  const trackRead = useCallback((emailId: string, duration: number) => {
    // Only track if read for at least 3 seconds
    if (duration >= 3) {
      track(emailId, 'read', duration)
    }
  }, [track])

  const trackArchive = useCallback((emailId: string) => {
    track(emailId, 'archive')
  }, [track])

  const trackDelete = useCallback((emailId: string) => {
    track(emailId, 'delete')
  }, [track])

  const trackStar = useCallback((emailId: string) => {
    track(emailId, 'star')
  }, [track])

  const trackUnstar = useCallback((emailId: string) => {
    track(emailId, 'unstar')
  }, [track])

  const trackReply = useCallback((emailId: string) => {
    track(emailId, 'reply')
  }, [track])

  // Reset tracked opens (useful when component unmounts/remounts)
  const resetTracking = useCallback(() => {
    trackedOpens.current.clear()
  }, [])

  return {
    track,
    trackOpen,
    trackRead,
    trackArchive,
    trackDelete,
    trackStar,
    trackUnstar,
    trackReply,
    resetTracking
  }
}
