import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/** Must run before creating a privileged client or doing any work. */
export function requireCronAuthorization(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret?.trim()) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
