import { z } from 'zod'

const date = z.iso.date()
const text = (limit: number) => z.string().trim().max(limit).refine(value => !value.includes('\0'))
export const askRequest = z.strictObject({
  query: text(300),
  accountIds: z.array(z.uuid()).max(20).default([]),
  sender: text(120).optional(),
  from: date.optional(),
  until: date.optional(),
  attachment: z.boolean().optional(),
  mode: z.enum(['hybrid', 'keyword']).default('hybrid'),
})

type Request = z.infer<typeof askRequest>
export type AskFilters = {
  accounts?: string[]; sender?: string; recipient?: string; subject?: string; category?: string
  fromAt?: string; beforeAt?: string; unread?: boolean; starred?: true; attachment?: true
  priority?: 'high' | 'normal' | 'low'
}

export class AskQueryError extends Error {}

const operators = /^(from|to|subject|category|after|before|is|has|priority):(?:"([^"]*)"|([^\s"]*))$/iu
const stop = new Set('tìm cho tôi các những thư email về một của được đã là cái nào khi và trong bằng với find me mail emails the a an about of for and in on to i please which what where when'.split(' '))

function boundary(raw: string) {
  const iso = raw.replaceAll('/', '-').replace(/-(\d)(?=-|$)/g, '-0$1')
  if (!date.safeParse(iso).success) throw new AskQueryError('Nhập ngày hợp lệ theo định dạng YYYY-MM-DD.')
  return Date.parse(iso + 'T00:00:00+07:00')
}

export function parseAskQuery(input: Request) {
  const filters: AskFilters = {}
  if (input.accountIds.length) filters.accounts = [...new Set(input.accountIds.map(id => id.toLowerCase()))]
  if (input.sender) filters.sender = input.sender
  if (input.attachment) filters.attachment = true
  const terms: string[] = []
  let from = input.from ? boundary(input.from) : -Infinity
  let until = input.until ? boundary(input.until) + 86_400_000 : Infinity

  function assign<K extends keyof AskFilters>(key: K, value: AskFilters[K]) {
    if (filters[key] !== undefined && filters[key] !== value) throw new AskQueryError('Có bộ lọc trùng nhưng khác giá trị.')
    filters[key] = value
  }

  const tokens = input.query.match(/(?:[^\s"]|"[^"]*")+/gu) ?? []
  for (const token of tokens) {
    const filter = operators.exec(token)
    if (!filter) {
      terms.push(token)
      continue
    }
    const key = filter[1].toLowerCase()
    const value = (filter[2] ?? filter[3]).trim()
    if (!value || value.length > 120) throw new AskQueryError('Kiểm tra giá trị của toán tử ' + key + '.')
    switch (key) {
      case 'from': assign('sender', value); break
      case 'to': assign('recipient', value); break
      case 'subject': assign('subject', value); break
      case 'category': assign('category', value.toLowerCase()); break
      case 'after': from = Math.max(from, boundary(value)); break
      case 'before': until = Math.min(until, boundary(value)); break
      case 'priority':
        if (value !== 'high' && value !== 'normal' && value !== 'low') throw new AskQueryError('Mức ưu tiên không hợp lệ.')
        assign('priority', value)
        break
      case 'is':
        if (value === 'starred') assign('starred', true)
        else if (value === 'read' || value === 'unread') assign('unread', value === 'unread')
        else throw new AskQueryError('Dùng is:read, is:unread hoặc is:starred.')
        break
      case 'has':
        if (value !== 'attachment') throw new AskQueryError('Dùng has:attachment để lọc tệp đính kèm.')
        assign('attachment', true)
    }
  }

  if (from >= until) throw new AskQueryError('Khoảng ngày tìm kiếm không hợp lệ.')
  if (Number.isFinite(from)) filters.fromAt = new Date(from).toISOString()
  if (Number.isFinite(until)) filters.beforeAt = new Date(until).toISOString()
  const query = terms.join(' ').normalize('NFC')
  const meaningful = terms.filter(term => !stop.has(term.toLowerCase().replace(/[?!.,]+$/u, '')))
  const keywords = (meaningful.length ? meaningful.join(' ') : query).normalize('NFC')
  if (!/[\p{L}\p{N}]/u.test(keywords)) {
    if (!Object.keys(filters).length) throw new AskQueryError('Nhập nội dung tìm kiếm hoặc chọn bộ lọc.')
    return { filters, query: '', keywords: '' }
  }
  return { filters, query, keywords }
}
