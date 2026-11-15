import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/inbox'
  // Only local absolute paths may be used after authentication.
  const target = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? new URL(next, origin) : new URL('/inbox', origin)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(target)
    }
    console.warn('Auth callback exchange failed', { code: error.code })
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate user`)
}
