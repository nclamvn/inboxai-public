import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ client: vi.fn(), aggregate: vi.fn(), sync: vi.fn(), classify: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/ai/classification-logger', () => ({ aggregateDailyMetrics: mocks.aggregate }))
vi.mock('@/lib/email/imap-client', () => ({ syncEmails: mocks.sync }))
vi.mock('@/lib/email/unsubscribe-service', () => ({ getUnsubscribeService: vi.fn() }))
vi.mock('@/lib/ai/classifier', () => ({ classifyEmail: mocks.classify }))
vi.mock('@/lib/notifications/create', () => ({ notifySyncComplete: vi.fn(), notifyAiClassified: vi.fn() }))
vi.mock('@/lib/ai/sender-reputation', () => ({ calculateConfidence: vi.fn() }))

import * as sync from '@/app/api/cron/sync-emails/route'
import * as classify from '@/app/api/cron/classify-emails/route'
import * as metrics from '@/app/api/cron/aggregate-metrics/route'
import * as reputation from '@/app/api/cron/recalculate-reputation/route'
import * as costs from '@/app/api/cron/aggregate-ai-costs/route'

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'synthetic-secret')
  const query = {
    from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve) },
  }
  mocks.client.mockReturnValue({ from: () => query })
  mocks.aggregate.mockResolvedValue({ success: true, count: 0 })
})

const routes = [
  ['sync GET', sync.GET], ['sync POST', sync.POST],
  ['classify GET', classify.GET], ['classify POST', classify.POST],
  ['metrics GET', metrics.GET], ['metrics POST', metrics.POST],
  ['reputation GET', reputation.GET], ['reputation POST', reputation.POST], ['costs POST', costs.POST],
] as const

describe.each(routes)('%s', (_name, handler) => {
  it.each(['missing configuration', 'missing header', 'wrong token'])('rejects %s without DB or provider work', async kind => {
    if (kind === 'missing configuration') vi.stubEnv('CRON_SECRET', '')
    const headers: Record<string, string> = kind === 'missing header' ? {} : { authorization: 'Bearer wrong' }
    const response = await handler(new NextRequest('http://localhost/api/cron/test', { headers }))
    expect(response.status).toBe(kind === 'missing configuration' ? 503 : 401)
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.aggregate).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(mocks.classify).not.toHaveBeenCalled()
  })
  it('accepts a valid scheduler token with synthetic empty data', async () => {
    const response = await handler(new NextRequest('http://localhost/api/cron/test', { headers: { authorization: 'Bearer synthetic-secret' } }))
    expect(response.status).toBe(200)
  })
})
