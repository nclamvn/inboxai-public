import { describe, expect, it } from 'vitest'
import { commitmentChanges, draftDeadline, formatCommitmentDue, isCommitmentGroup, localDeadline, sourceEmailId } from '@/lib/commitments/view'

const id = '20000000-0000-4000-8000-000000000061'
const origin = 'http://127.0.0.1:55300'
const state = { title: 'Giao 200 bộ', ownerName: null, ownerEmail: null, status: 'open' as const, dueOn: null, dueAt: '2026-11-19T09:30:00.123456Z' }

describe('commitment view contracts', () => {
  it('accepts only Inbox source links of the current origin or a UUID', () => {
    expect(sourceEmailId(id.toUpperCase(), origin)).toBe(id)
    expect(sourceEmailId(`/inbox?email=${id}`, origin)).toBe(id)
    expect(sourceEmailId(`${origin}/inbox?email=${id}`, origin)).toBe(id)
    expect(sourceEmailId(`https://example.test/inbox?email=${id}`, origin)).toBeNull()
    expect(sourceEmailId(`/sent?email=${id}`, origin)).toBeNull()
    expect(sourceEmailId('javascript:alert(1)', origin)).toBeNull()
  })

  it('formats a date-only deadline independently of the machine timezone', () => {
    expect(formatCommitmentDue({ dueOn: '2026-11-19', dueAt: null })).toContain('19')
    expect(formatCommitmentDue({ dueOn: null, dueAt: null })).toBe('Chưa có hạn')
  })

  it('uses UTC+7 for new timed deadlines and keeps the exact existing instant when unedited', () => {
    expect(localDeadline(state.dueAt)).toBe('2026-11-19T16:30:00')
    expect(draftDeadline('time', '2026-11-19T16:30', state)).toEqual({ dueOn: null, dueAt: state.dueAt })
    expect(draftDeadline('time', '2026-11-20T09:15', state)).toEqual({ dueOn: null, dueAt: '2026-11-20T09:15:00+07:00' })
    expect(draftDeadline('date', '2026-11-20', state)).toEqual({ dueOn: '2026-11-20', dueAt: null })
  })

  it('previews a review resolution even without a term change and keeps no-op edits empty', () => {
    expect(commitmentChanges({ ...state, review: null }, state)).toEqual([])
    expect(commitmentChanges({ ...state, review: { kind: 'conflicting', note: 'Different due dates' } }, state)).toEqual([
      { field: 'Xem xét', from: 'Có nguồn mâu thuẫn', to: 'Đã xác nhận' },
    ])
  })

  it('rejects unknown groups including object prototype names', () => {
    expect(isCommitmentGroup('overdue')).toBe(true)
    expect(isCommitmentGroup('constructor')).toBe(false)
    expect(isCommitmentGroup(null)).toBe(false)
  })
})
