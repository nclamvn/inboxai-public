'use client'

/**
 * Network Status Hook
 * Detects online/offline state and provides network quality information
 */

import { useState, useEffect, useCallback } from 'react'

// =============================================================================
// Types
// =============================================================================

export interface NetworkStatus {
  isOnline: boolean
  wasOffline: boolean // True if user was offline and came back online
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' // Network quality
  downlink?: number // Estimated bandwidth in Mbps
  rtt?: number // Round-trip time in ms
  saveData?: boolean // User has requested reduced data usage
}

export interface UseNetworkStatusOptions {
  onOnline?: () => void
  onOffline?: () => void
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useNetworkStatus(options?: UseNetworkStatusOptions): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
  }))

  const updateNetworkInfo = useCallback(() => {
    if (typeof navigator === 'undefined') return

    // Get Network Information API data if available
    const connection =
      (navigator as NavigatorWithConnection).connection ||
      (navigator as NavigatorWithConnection).mozConnection ||
      (navigator as NavigatorWithConnection).webkitConnection

    setStatus((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData,
    }))
  }, [])

  const handleOnline = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      isOnline: true,
      wasOffline: true,
    }))
    updateNetworkInfo()
    options?.onOnline?.()
  }, [options, updateNetworkInfo])

  const handleOffline = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      isOnline: false,
    }))
    options?.onOffline?.()
  }, [options])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initial network info
    updateNetworkInfo()

    // Listen for online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listen for connection changes (if supported)
    const connection =
      (navigator as NavigatorWithConnection).connection ||
      (navigator as NavigatorWithConnection).mozConnection ||
      (navigator as NavigatorWithConnection).webkitConnection

    if (connection) {
      connection.addEventListener('change', updateNetworkInfo)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (connection) {
        connection.removeEventListener('change', updateNetworkInfo)
      }
    }
  }, [handleOnline, handleOffline, updateNetworkInfo])

  // Reset wasOffline flag after a delay
  useEffect(() => {
    if (status.wasOffline) {
      const timer = setTimeout(() => {
        setStatus((prev) => ({ ...prev, wasOffline: false }))
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [status.wasOffline])

  return status
}

// =============================================================================
// Network Information API Types
// =============================================================================

interface NetworkInformation extends EventTarget {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g'
  downlink?: number
  rtt?: number
  saveData?: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation
  mozConnection?: NetworkInformation
  webkitConnection?: NetworkInformation
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if user is on a slow connection
 */
export function isSlowConnection(status: NetworkStatus): boolean {
  if (!status.isOnline) return false
  if (status.effectiveType === 'slow-2g' || status.effectiveType === '2g') return true
  if (status.rtt && status.rtt > 500) return true
  if (status.downlink && status.downlink < 1) return true
  return false
}

/**
 * Get connection quality label
 */
export function getConnectionQuality(status: NetworkStatus): 'offline' | 'poor' | 'moderate' | 'good' {
  if (!status.isOnline) return 'offline'

  if (status.effectiveType) {
    switch (status.effectiveType) {
      case 'slow-2g':
      case '2g':
        return 'poor'
      case '3g':
        return 'moderate'
      case '4g':
        return 'good'
    }
  }

  // Fallback to RTT-based estimation
  if (status.rtt) {
    if (status.rtt > 500) return 'poor'
    if (status.rtt > 200) return 'moderate'
    return 'good'
  }

  return 'good'
}

export default useNetworkStatus
