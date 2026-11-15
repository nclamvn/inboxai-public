import { describe, expect, it } from 'vitest'
import { askRequest, parseAskQuery } from '@/lib/search/ask-query'

const parse = (query: string, extra = {}) => parseAskQuery(askRequest.parse({ query, ...extra }))

describe('Ask Inbox query and scope', () => {
  it('preserves Vietnamese for the encoder and removes conversational stop words only from lexical matching', () => {
    expect(parse('tìm cho tôi email về thay lịch giao hàng')).toEqual({
      filters: {}, query: 'tìm cho tôi email về thay lịch giao hàng', keywords: 'thay lịch giao hàng',
    })
  })

  it('retains quoted operators and combines strict attachment and read filters', () => {
    expect(parse('xác nhận from:"Nhà cung cấp" to:pay@example.test subject:"Đợt 2" is:unread has:attachment').filters)
      .toEqual({ sender: 'Nhà cung cấp', recipient: 'pay@example.test', subject: 'Đợt 2', unread: true, attachment: true })
  })

  it('intersects inclusive UI dates and exclusive inline bounds at UTC+7 midnight', () => {
    expect(parse('after:2026/11/2 before:2026-11-05', { from: '2026-11-03', until: '2026-11-05' })).toEqual({
      filters: { fromAt: '2026-11-02T17:00:00.000Z', beforeAt: '2026-11-04T17:00:00.000Z' }, query: '', keywords: '',
    })
  })

  it('keeps account scope on filter-only searches and normalizes duplicates', () => {
    const account = '10000000-0000-4000-8000-000000000091'
    expect(parse('', { accountIds: [account, account] }).filters).toEqual({ accounts: [account] })
  })

  it.each(['after:2026-02-30', 'after:2026-11-05 before:2026-11-05', 'from:', 'is:unknown', '???'])(
    'rejects empty or invalid scope: %s', query => expect(() => parse(query)).toThrow(),
  )

  it('accepts punctuation in filter values without emitting a query DSL', () => {
    expect(parse('from:"%,)secret" QZ-751').filters.sender).toBe('%,)secret')
    expect(askRequest.safeParse({ query: 'q', p_user_id: 'foreign' }).success).toBe(false)
  })
})
