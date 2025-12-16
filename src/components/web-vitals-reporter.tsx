'use client'

/**
 * Web Vitals Reporter Component
 * Reports Core Web Vitals metrics to Sentry
 */

import { useEffect } from 'react'
import { reportWebVitals } from '@/lib/web-vitals'

export function WebVitalsReporter() {
  useEffect(() => {
    reportWebVitals()
  }, [])

  return null
}

export default WebVitalsReporter
