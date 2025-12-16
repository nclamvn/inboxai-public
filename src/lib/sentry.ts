/**
 * Sentry Utilities
 * Wrapper functions for common Sentry operations
 */

import * as Sentry from '@sentry/nextjs'

// =============================================================================
// User Context
// =============================================================================

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; name?: string } | null) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * Clear user context (on logout)
 */
export function clearUser() {
  Sentry.setUser(null)
}

// =============================================================================
// Breadcrumbs
// =============================================================================

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string = 'app',
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  })
}

/**
 * Track API call breadcrumb
 */
export function trackApiCall(
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number
) {
  addBreadcrumb(
    `${method} ${endpoint} - ${statusCode}`,
    'api',
    statusCode >= 400 ? 'error' : 'info',
    { duration, statusCode }
  )
}

/**
 * Track user action breadcrumb
 */
export function trackUserAction(action: string, data?: Record<string, unknown>) {
  addBreadcrumb(action, 'user', 'info', data)
}

/**
 * Track page view breadcrumb
 */
export function trackPageView(pageName: string, url: string) {
  addBreadcrumb(`Viewed ${pageName}`, 'navigation', 'info', { url })
}

// =============================================================================
// Error Capturing
// =============================================================================

/**
 * Capture exception with extra context
 */
export function captureException(
  error: Error,
  context?: {
    tags?: Record<string, string>
    extra?: Record<string, unknown>
    level?: Sentry.SeverityLevel
  }
) {
  Sentry.withScope((scope) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value)
      })
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })
    }

    if (context?.level) {
      scope.setLevel(context.level)
    }

    Sentry.captureException(error)
  })
}

/**
 * Capture message
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info'
) {
  Sentry.captureMessage(message, level)
}

// =============================================================================
// Performance Monitoring
// =============================================================================

/**
 * Start a span for performance monitoring
 */
export function startSpan(
  name: string,
  op: string = 'custom'
): Sentry.Span | undefined {
  return Sentry.startInactiveSpan({
    name,
    op,
  })
}

/**
 * Wrap async function with error tracking and performance monitoring
 */
export async function withSentry<T>(
  name: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const span = startSpan(name, 'function')

  try {
    const result = await fn()
    span?.end()
    return result
  } catch (error) {
    captureException(error as Error, { extra: context })
    span?.end()
    throw error
  }
}

// =============================================================================
// Tags
// =============================================================================

/**
 * Set global tag
 */
export function setTag(key: string, value: string) {
  Sentry.setTag(key, value)
}

/**
 * Set multiple tags
 */
export function setTags(tags: Record<string, string>) {
  Sentry.setTags(tags)
}

// =============================================================================
// Re-export Sentry for advanced use cases
// =============================================================================

export { Sentry }
