import { describe, expect, it, vi } from 'vitest'
import { requireCronAuthorization } from '@/lib/security/cron'

describe('cron authorization', () => {
  it.each(['', '   '])('fails closed with unconfigured secret %j', secret => {
    vi.stubEnv('CRON_SECRET', secret)
    expect(requireCronAuthorization(new Request('http://localhost'))?.status).toBe(503)
  })
  it.each(['', 'Bearer undefined', 'Bearer wrong', 'Basic configured', 'Bearer configured-extra', 'bearer configured'])('rejects %j', authorization => {
    vi.stubEnv('CRON_SECRET', 'configured')
    expect(requireCronAuthorization(new Request('http://localhost', { headers: { authorization } }))?.status).toBe(401)
  })
  it('allows the configured bearer token', () => {
    vi.stubEnv('CRON_SECRET', 'configured')
    expect(requireCronAuthorization(new Request('http://localhost', { headers: { authorization: 'Bearer configured' } }))).toBeNull()
  })
})
