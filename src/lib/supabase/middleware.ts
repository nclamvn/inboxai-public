import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require whitelist check
const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth/callback', '/access-denied']
const PUBLIC_API_ROUTES = ['/api/access-request', '/api/auth']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Skip auth check if Supabase is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Check if public route (no auth required)
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route) ||
    PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))

  // API routes are generally accessible (they handle their own auth)
  const isApiRoute = pathname.startsWith('/api/')

  // Redirect to login if accessing protected route without auth
  if (!user && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect to inbox if accessing auth pages while logged in
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/inbox'
    return NextResponse.redirect(url)
  }

  // Skip whitelist check for public routes, access-denied page, and API routes
  if (!user || isPublicRoute || isApiRoute || pathname === '/access-denied') {
    return supabaseResponse
  }

  // Check whitelist for authenticated users accessing protected routes
  const userEmail = user.email?.toLowerCase()

  if (userEmail) {
    const { data: whitelisted } = await supabase
      .from('whitelist')
      .select('id')
      .eq('email', userEmail)
      .eq('is_active', true)
      .maybeSingle()

    // Not in whitelist -> redirect to access denied
    if (!whitelisted) {
      const url = request.nextUrl.clone()
      url.pathname = '/access-denied'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
