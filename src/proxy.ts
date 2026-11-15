/**
 * Next.js Proxy (replaces middleware in Next.js 16)
 * Handles security headers, rate limiting, and session management
 */

import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Security headers following OWASP recommendations
const securityHeaders: Record<string, string> = {
  // Prevent clickjacking attacks
  'X-Frame-Options': 'DENY',
  // Block MIME-type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Enable XSS filter in older browsers
  'X-XSS-Protection': '1; mode=block',
  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions policy
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  // DNS prefetch control
  'X-DNS-Prefetch-Control': 'on',
}

// Content Security Policy
const cspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'https://js.sentry-cdn.com',
    'https://*.sentry.io',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.googleusercontent.com',
    'https://*.google.com',
    'https://*.sentry.io',
  ],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.sentry.io',
    'https://o4509462768779264.ingest.us.sentry.io',
    'https://apis.google.com',
    'https://www.googleapis.com',
    'https://oauth2.googleapis.com',
  ],
  'frame-src': ["'self'", 'https://accounts.google.com'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
}

// Build CSP header string
function buildCSP(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key
      return `${key} ${values.join(' ')}`
    })
    .join('; ')
}

const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']

function configuredSupabaseOrigin(localApp: boolean): string | null {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    if (url.protocol === 'https:' || (url.protocol === 'http:' && loopbackHosts.includes(url.hostname) && localApp)) {
      return url.origin
    }
  } catch {
    // Keep the default allowlist when Supabase configuration is absent or invalid.
  }
  return null
}

// Routes that are completely public (no security headers needed)
const PUBLIC_ASSETS = [
  '/favicon',
  '/icons/',
  '/images/',
  '/manifest.json',
  '/inbox-offline-sw.js',
  '/offline-workspace/',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The cached offline document includes no user data and carries its own CSP.
  // Keep the anti-framing and browser security headers on the cached response.
  if (pathname === '/offline-workspace/index.html') {
    const response = NextResponse.next()
    Object.entries(securityHeaders).forEach(([key, value]) => response.headers.set(key, value))
    response.headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'")
    return response
  }

  // Skip for static assets
  if (PUBLIC_ASSETS.some(asset => pathname.startsWith(asset))) {
    return NextResponse.next()
  }

  // Apply session management (handles auth redirects)
  const response = await updateSession(request)

  // Add security headers to all responses
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // Add CSP header (less strict in development)
  const localApp = request.nextUrl.protocol === 'http:' && loopbackHosts.includes(request.nextUrl.hostname)
  const supabaseOrigin = configuredSupabaseOrigin(localApp)
  const directives = { ...cspDirectives }
  if (supabaseOrigin) directives['connect-src'] = [...directives['connect-src'], supabaseOrigin]
  if (localApp) delete directives['upgrade-insecure-requests']
  const csp = buildCSP(directives)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', csp)
    // Add HSTS header (only in production with HTTPS)
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  } else {
    // Report-only in development to avoid breaking HMR
    response.headers.set('Content-Security-Policy-Report-Only', csp)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
