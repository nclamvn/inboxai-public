/**
 * Core Web Vitals Monitoring
 * Tracks LCP, FID, CLS, FCP, TTFB and reports to Sentry
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { addBreadcrumb } from './sentry'

type WebVitalsRating = 'good' | 'needs-improvement' | 'poor'

interface WebVitalsMetric {
  name: string
  value: number
  rating: WebVitalsRating
  delta: number
  id: string
}

// Thresholds based on Google's Core Web Vitals guidelines
const THRESHOLDS: Record<string, [number, number]> = {
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  INP: [200, 500], // Interaction to Next Paint (replaces FID)
  LCP: [2500, 4000],
  TTFB: [800, 1800],
}

function getRating(name: string, value: number): WebVitalsRating {
  const thresholds = THRESHOLDS[name]
  if (!thresholds) return 'good'

  const [good, poor] = thresholds
  if (value <= good) return 'good'
  if (value <= poor) return 'needs-improvement'
  return 'poor'
}

function sendToAnalytics(metric: WebVitalsMetric) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    const color = metric.rating === 'good' ? '32' : metric.rating === 'needs-improvement' ? '33' : '31'
    console.log(
      `%c[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`,
      `color: \x1b[${color}m`
    )
  }

  // Send to Sentry as breadcrumb
  addBreadcrumb(`Web Vitals: ${metric.name}`, 'performance', 'info', {
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
  })

  // Optionally send to analytics endpoint in production
  if (process.env.NODE_ENV === 'production' && metric.rating === 'poor') {
    // Only report poor metrics to reduce noise
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'web_vitals',
        properties: {
          metric_name: metric.name,
          metric_value: metric.value,
          metric_rating: metric.rating,
        },
      }),
    }).catch(() => {
      // Silently fail - don't block user
    })
  }
}

function handleMetric(metric: Metric) {
  sendToAnalytics({
    name: metric.name,
    value: metric.value,
    rating: getRating(metric.name, metric.value),
    delta: metric.delta,
    id: metric.id,
  })
}

/**
 * Initialize Web Vitals monitoring
 * Call this once in the root layout
 */
export function reportWebVitals() {
  // Only run in browser
  if (typeof window === 'undefined') return

  onCLS(handleMetric)
  onFCP(handleMetric)
  onINP(handleMetric) // Interaction to Next Paint (replaced FID)
  onLCP(handleMetric)
  onTTFB(handleMetric)
}

/**
 * Get current performance metrics summary
 */
export function getPerformanceSummary(): Record<string, number> {
  if (typeof window === 'undefined') return {}

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming

  return {
    // Page load timing
    domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.fetchStart || 0,
    loadComplete: navigation?.loadEventEnd - navigation?.fetchStart || 0,

    // Resource timing
    resourceCount: performance.getEntriesByType('resource').length,

    // Memory (if available)
    ...(typeof (performance as any).memory !== 'undefined' && {
      usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
      totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
    }),
  }
}

export default reportWebVitals
