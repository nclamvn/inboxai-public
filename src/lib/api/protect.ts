/**
 * API Route Protection Helper
 * Wraps API routes with security features:
 * - Rate limiting
 * - Input validation
 * - Authentication check
 * - Error handling
 * - CSRF protection
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIP,
  rateLimitResponse,
  RATE_LIMIT_PRESETS,
  type RateLimitConfig,
} from '@/lib/rate-limit'
import { formatValidationErrors } from '@/lib/validation'
import { captureException } from '@/lib/sentry'
import { ApiError } from './errors'

// CSRF Token header name
const CSRF_HEADER = 'x-csrf-token'
const CSRF_COOKIE = 'csrf-token'

export interface ProtectedRouteOptions<T extends z.ZodSchema | undefined> {
  // Rate limiting preset or custom config
  rateLimit?: keyof typeof RATE_LIMIT_PRESETS | RateLimitConfig
  // Require authentication
  requireAuth?: boolean
  // Require admin role
  requireAdmin?: boolean
  // Request body validation schema
  bodySchema?: T
  // Allowed HTTP methods
  methods?: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[]
  // Enable CSRF protection (for state-changing operations)
  csrf?: boolean
}

export interface ProtectedContext<T = unknown> {
  // Validated request body (if schema provided)
  body: T
  // Authenticated user (if requireAuth)
  user: {
    id: string
    email: string
    role?: string
  } | null
  // Client IP address
  clientIP: string
  // Request object
  request: NextRequest
}

type RouteHandler<T = unknown> = (
  context: ProtectedContext<T>
) => Promise<NextResponse> | NextResponse

/**
 * Create a protected API route handler
 */
export function protectedRoute<T extends z.ZodSchema | undefined = undefined>(
  options: ProtectedRouteOptions<T>,
  handler: RouteHandler<T extends z.ZodSchema ? z.infer<T> : undefined>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const clientIP = getClientIP(request)

    try {
      // 1. Check HTTP method
      if (options.methods && !options.methods.includes(request.method as any)) {
        return NextResponse.json(
          { error: 'Method not allowed' },
          { status: 405, headers: { Allow: options.methods.join(', ') } }
        )
      }

      // 2. Rate limiting
      if (options.rateLimit) {
        const config =
          typeof options.rateLimit === 'string'
            ? RATE_LIMIT_PRESETS[options.rateLimit]
            : options.rateLimit

        const rateLimitKey = `${request.nextUrl.pathname}:${clientIP}`
        const result = checkRateLimit(rateLimitKey, config)

        if (!result.allowed) {
          return rateLimitResponse(result)
        }
      }

      // 3. CSRF protection for state-changing operations
      if (options.csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const csrfHeader = request.headers.get(CSRF_HEADER)
        const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value

        if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
          return NextResponse.json(
            { error: 'Invalid CSRF token' },
            { status: 403 }
          )
        }
      }

      // 4. Authentication check
      let user: ProtectedContext['user'] = null

      if (options.requireAuth || options.requireAdmin) {
        const supabase = await createClient()
        const { data: { user: authUser }, error } = await supabase.auth.getUser()

        if (error || !authUser) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        }

        user = {
          id: authUser.id,
          email: authUser.email!,
          role: authUser.app_metadata?.role,
        }

        // Admin check
        if (options.requireAdmin) {
          const isAdmin = authUser.email?.endsWith('@admin.inboxai.com') ||
            authUser.app_metadata?.role === 'admin'

          if (!isAdmin) {
            return NextResponse.json(
              { error: 'Forbidden' },
              { status: 403 }
            )
          }
        }
      }

      // 5. Body validation
      let body: any = undefined

      if (options.bodySchema && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        try {
          const rawBody = await request.json()
          const result = options.bodySchema.safeParse(rawBody)

          if (!result.success) {
            return NextResponse.json(
              {
                error: 'Validation failed',
                details: formatValidationErrors(result.error),
              },
              { status: 400 }
            )
          }

          body = result.data
        } catch {
          return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 }
          )
        }
      }

      // 6. Execute handler
      const context: ProtectedContext<any> = {
        body,
        user,
        clientIP,
        request,
      }

      return await handler(context)

    } catch (error) {
      // Handle known API errors
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        )
      }

      // Log unexpected errors to Sentry
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { api: request.nextUrl.pathname },
        extra: { method: request.method, clientIP },
      })

      // Return generic error in production
      const message = process.env.NODE_ENV === 'development'
        ? (error instanceof Error ? error.message : String(error))
        : 'Internal server error'

      return NextResponse.json(
        { error: message },
        { status: 500 }
      )
    }
  }
}

/**
 * Generate CSRF token and set cookie
 */
export function generateCSRFToken(): { token: string; cookie: string } {
  const token = crypto.randomUUID()
  const cookie = `${CSRF_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`
  return { token, cookie }
}

/**
 * Helper to create API responses with standard format
 */
export function apiResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status, headers }
  )
}

/**
 * Helper to create error responses
 */
export function apiError(
  message: string,
  status = 400,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { success: false, error: message, ...details },
    { status }
  )
}

// Export preset configurations for convenience
export { RATE_LIMIT_PRESETS }
