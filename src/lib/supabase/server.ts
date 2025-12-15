import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

/**
 * Create Supabase client for server-side use with cookies
 * Use for web app (browser) requests
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

/**
 * Create Supabase client with Bearer token authentication
 * Use for mobile app requests that send Authorization header
 */
export function createClientFromToken(token: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  )
}

/**
 * Create Supabase client that supports both:
 * - Bearer token auth (mobile apps)
 * - Cookie auth (web browser)
 *
 * Automatically detects which method to use based on request headers
 */
export async function createClientForRequest(request: NextRequest) {
  // Check for Bearer token first (mobile apps)
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.replace('Bearer ', '')

  if (bearerToken) {
    // Mobile: Use Bearer token
    return createClientFromToken(bearerToken)
  }

  // Web: Use cookie-based auth
  return createClient()
}
