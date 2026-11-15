import { describe, expect, it } from 'vitest'
import { compareInboxPriority, rankActionInbox } from '@/lib/action-inbox/rank'
import type { Email } from '@/types'

const now = Date.parse('2026-11-11T12:00:00Z')
const mail = (id: string, fields: Partial<Email> = {}) => ({
  id, subject: 'Cập nhật', from_address: 'operator@example.test', received_at: '2026-11-11T08:00:00Z',
  source_account_id: 'account-a', priority: 3 as const, category: 'work' as const,
  detected_deadline: null, needs_reply: false, is_starred: false, is_read: false, ...fields,
})

describe('Action Inbox ranking', () => {
  it('surfaces a recent incident independently of sender status, category and read status', () => {
    const incident = mail('incident', { category: 'personal', priority: 1, is_read: true, subject: 'Cảnh báo dừng dây chuyền ở kho C' })
    const result = rankActionInbox([incident], now).get(incident.id)!
    expect(result.band).toBe('action')
    expect(result.reasons[0]).toMatchObject({
      signal: 'alert', sources: [{ emailId: incident.id, excerpt: 'dừng dây chuyền' }],
    })
  })

  it('keeps receipts, drills, resolved and stale alerts from being escalated on lexical evidence alone', () => {
    const messages = [
      mail('receipt', { category: 'transaction', priority: 5, needs_reply: true, subject: 'Thanh toán thành công' }),
      mail('drill', { subject: 'Diễn tập sự cố sản xuất' }),
      mail('resolved', { subject: 'Service outage resolved' }),
      mail('maintenance', { subject: 'Dừng dây chuyền dự kiến lúc 07:00 để bảo trì' }),
      mail('stale', { subject: 'Security alert', received_at: '2026-10-28T10:00:00Z' }),
    ]
    const ranks = rankActionInbox(messages, now)
    expect([...ranks.values()].map(rank => rank.band)).toEqual(['later', 'primary', 'primary', 'primary', 'primary'])
    expect(ranks.get('receipt')!.reasons[0].sources[0].excerpt).toBe('Thanh toán thành công')
  })

  it('extracts a verbatim reply signal from a bounded preview and respects no-reply addresses', () => {
    const snippet = 'Mong kịp chuyến sáng. Vui lòng xác nhận khung giờ nhận kho.'
    const messages = [
      mail('reply', { is_read: true, snippet }),
      mail('automated', { from_address: 'no-reply@example.test', snippet, needs_reply: true }),
      mail('beyond-preview', { snippet: ' '.repeat(481) + 'Please confirm' }),
    ]
    const ranks = rankActionInbox(messages, now)
    expect(ranks.get('reply')!.reasons[0]).toMatchObject({ signal: 'reply', sources: [{ emailId: 'reply', excerpt: 'Vui lòng xác nhận' }] })
    expect(ranks.get('automated')!.band).toBe('primary')
    expect(ranks.get('beyond-preview')!.band).toBe('primary')
  })

  it('ranks actionable deadlines by due time and declines stale, distant or invalid values', () => {
    const messages = [
      mail('later', { detected_deadline: '2026-11-12T08:00:00Z' }),
      mail('earlier', { detected_deadline: '2026-11-11T11:00:00Z' }),
      mail('bad', { detected_deadline: 'trước ngày 18/11' }),
      mail('future', { detected_deadline: '2026-12-11T08:00:00Z' }),
      mail('pre-receipt', { detected_deadline: '2026-11-09T08:00:00Z' }),
    ]
    const ranks = [...rankActionInbox(messages, now).values()].sort(compareInboxPriority)
    expect(ranks.slice(0, 2).map(rank => rank.emailId)).toEqual(['earlier', 'later'])
    expect(ranks[0].reasons[0]).toMatchObject({ signal: 'deadline', date: '2026-11-11T11:00:00Z', sources: [{ emailId: 'earlier' }] })
    expect(ranks.slice(2).map(rank => rank.band)).toEqual(['primary', 'primary', 'primary'])
  })

  it('applies explicit per-message corrections including when a manual override is cleared', () => {
    const message = mail('a', { subject: 'Đăng nhập bất thường' })
    expect(rankActionInbox([{ ...message, inbox_priority: 'later' }], now).get('a')!.reasons[0].signal).toBe('manual')
    expect(rankActionInbox([{ ...message, inbox_priority: 'later' }], now).get('a')!.band).toBe('later')
    expect(rankActionInbox([{ ...message, inbox_priority: null }], now).get('a')!.band).toBe('action')
  })

  it('learns a tie-break only from consistent corrections within the same sender and account', () => {
    const messages = [
      mail('recent', { inbox_priority: 'action', received_at: '2026-11-10T08:00:00Z' }),
      mail('older', { from_address: 'OPERATOR@example.test', inbox_priority: 'action', received_at: '2026-11-09T08:00:00Z' }),
      mail('foreign-account', { source_account_id: 'account-b', received_at: '2026-11-11T09:00:00Z' }),
      mail('same-account'),
      mail('incident', { subject: 'Production outage' }),
    ]
    const ranks = rankActionInbox(messages, now)
    expect(ranks.get('same-account')).toMatchObject({ band: 'primary', preference: 1 })
    expect(ranks.get('foreign-account')).toMatchObject({ band: 'primary', preference: 0 })
    expect(ranks.get('incident')).toMatchObject({ band: 'action', preference: 0 })
    expect(ranks.get('same-account')!.reasons.at(-1)!.sources.map(source => source.emailId)).toEqual(['recent', 'older'])
    expect(compareInboxPriority(ranks.get('same-account')!, ranks.get('foreign-account')!)).toBeLessThan(0)
  })

  it('does not learn from mixed choices, unknown accounts, or choices outside the lookback', () => {
    const messages = [
      mail('a', { inbox_priority: 'later', received_at: '2026-11-10T08:00:00Z' }),
      mail('b', { inbox_priority: 'action', received_at: '2026-11-09T08:00:00Z' }),
      mail('c', { inbox_priority: 'later', received_at: '2026-07-01T08:00:00Z' }),
      mail('d'), mail('e', { source_account_id: null }),
    ]
    const ranks = rankActionInbox(messages, now)
    expect(ranks.get('d')!.preference).toBe(0)
    expect(ranks.get('e')!.preference).toBe(0)
  })

  it('has deterministic ordering on tied or missing timestamps and does not mutate inputs', () => {
    const messages = Object.freeze([mail('a', { received_at: null }), mail('b', { received_at: null })])
    const ranks = [...rankActionInbox(messages, now).values()].sort(compareInboxPriority)
    expect(ranks.map(rank => rank.emailId)).toEqual(['b', 'a'])
    expect(messages[0].id).toBe('a')
  })
})
