/**
 * Sentry Server Configuration
 * This file configures the initialization of Sentry on the server (Node.js).
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Profiling (optional - for performance insights)
  profilesSampleRate: 0.1,

  // Filter errors before sending
  beforeSend(event, hint) {
    const error = hint.originalException as Error

    // Don't send expected client errors (4xx)
    if (error?.name === 'ApiError') {
      const statusCode = (error as any).statusCode
      if (statusCode >= 400 && statusCode < 500) {
        return null
      }
    }

    return event
  },

  // Enable debug in development
  debug: process.env.NODE_ENV === 'development',
})
