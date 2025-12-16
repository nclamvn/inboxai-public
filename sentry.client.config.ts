/**
 * Sentry Client Configuration
 * This file configures the initialization of Sentry on the client (browser).
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',

  // Performance Monitoring - sample 10% in production, 100% in development
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay - capture 10% of sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Filter errors before sending
  beforeSend(event, hint) {
    const error = hint.originalException as Error

    if (error?.message) {
      // Ignore network errors from user's connection
      if (error.message.includes('Failed to fetch')) {
        return null
      }
      // Ignore cancelled requests
      if (error.message.includes('AbortError')) {
        return null
      }
      // Ignore ResizeObserver errors (browser quirk)
      if (error.message.includes('ResizeObserver')) {
        return null
      }
    }

    return event
  },

  // Ignore errors from browser extensions
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
  ],

  // Enable debug in development
  debug: process.env.NODE_ENV === 'development',
})
