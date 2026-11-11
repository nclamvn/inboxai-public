import { NextRequest, NextResponse } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from '@/proxy'

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: async () => NextResponse.next() }))

afterEach(() => vi.unstubAllEnvs())

describe('production Supabase CSP', () => {
  it('permits only the configured loopback origin for local HTTP', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55321')
    const response = await proxy(new NextRequest('http://127.0.0.1:55300/inbox'))
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain('http://127.0.0.1:55321')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('preserves the secure policy on a hosted request with loopback configuration', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55321')
    const response = await proxy(new NextRequest('https://app.example.test/inbox'))
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).not.toContain('http://127.0.0.1:55321')
    expect(csp).toContain('upgrade-insecure-requests')
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
  })

  it('uses only the origin from an explicitly configured HTTPS endpoint', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test/supabase')
    const response = await proxy(new NextRequest('https://app.example.test/inbox'))
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain('https://db.example.test')
    expect(csp).not.toContain('/supabase')
  })
})
