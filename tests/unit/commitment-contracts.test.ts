import { describe, expect, it } from 'vitest'
import { createCommitment, historyCursor, pageLimit, requestKey, reviseCommitment } from '@/lib/commitments/contracts'

const quote = '  Giao 200 bộ ngày 15/11.\n'
const evidence = [{ emailId: '20000000-0000-4000-8000-000000000061', field: 'body_text', quote }]
const state = {
  title: '  Giao 200 bộ  ', ownerName: null, ownerEmail: null, dueOn: '2026-11-15', dueAt: null, status: 'open',
}
const create = { referenceKey: ' PO-1042:Delivery ', state, evidence }

describe('commitment request contract', () => {
  it('normalizes stable references without modifying the verbatim quote or guessing ownership', () => {
    expect(createCommitment.parse(create)).toEqual({
      referenceKey: 'po-1042:delivery',
      state: { ...state, title: 'Giao 200 bộ' },
      evidence,
    })
  })

  it('distinguishes a date-only deadline, an explicit instant, and an unknown deadline', () => {
    for (const dueAt of ['2026-11-19T16:00:00+07:00', '2026-11-19T09:00:00.123456Z', null]) {
      expect(createCommitment.safeParse({ ...create, state: { ...state, dueOn: null, dueAt } }).success).toBe(true)
    }
    expect(createCommitment.safeParse({ ...create, state: { ...state, dueAt: '2026-11-19T09:00:00Z' } }).success).toBe(false)
    expect(createCommitment.safeParse({ ...create, state: { ...state, dueOn: '2026-02-30' } }).success).toBe(false)
    expect(createCommitment.safeParse({ ...create, state: { ...state, dueOn: null, dueAt: '2026-11-19T16:00:00' } }).success).toBe(false)
  })

  it('rejects client-supplied authority and bounds evidence payloads', () => {
    expect(createCommitment.safeParse({ ...create, userId: 'someone-else' }).success).toBe(false)
    expect(createCommitment.safeParse({ ...create, state: { ...state, title: 'unfit\0text' } }).success).toBe(false)
    expect(createCommitment.safeParse({ ...create, evidence: [{ ...evidence[0], quote: ' '.repeat(12) }] }).success).toBe(false)
    expect(createCommitment.safeParse({ ...create, evidence: Array.from({ length: 4 }, () => evidence[0]) }).success).toBe(false)
    expect(createCommitment.safeParse({ ...create, evidence: [{ ...evidence[0], field: 'body_html' }] }).success).toBe(false)
  })

  it('keeps flagging review separate from changing confirmed fields', () => {
    const flag = { operation: 'flag_review', expectedVersion: 2, review: { kind: 'ambiguous', note: 'Chưa rõ người giao.' }, evidence }
    expect(reviseCommitment.safeParse(flag).success).toBe(true)
    expect(reviseCommitment.safeParse({ ...flag, state }).success).toBe(false)
    expect(reviseCommitment.safeParse({ operation: 'revise', expectedVersion: 0, state, evidence }).success).toBe(false)
    expect(reviseCommitment.safeParse({ operation: 'revise', expectedVersion: 2, state, evidence: [] }).success).toBe(false)
  })

  it('bounds page and revision cursors and requires a UUIDv4 idempotency key', () => {
    expect(pageLimit.parse('50')).toBe(50)
    expect(pageLimit.safeParse('51').success).toBe(false)
    expect(pageLimit.safeParse('1e1').success).toBe(false)
    expect(historyCursor.parse('2147483647')).toBe(2147483647)
    expect(historyCursor.safeParse('2147483648').success).toBe(false)
    expect(requestKey.safeParse('20000000-0000-4000-8000-000000000061').success).toBe(true)
    expect(requestKey.safeParse('20000000-0000-1000-8000-000000000061').success).toBe(false)
  })
})
