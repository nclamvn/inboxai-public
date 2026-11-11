import { z } from 'zod'
import type { OperatorSpec } from './contracts'

const actionPattern = /^(lưu trữ|đánh dấu đã đọc|archive|mark as read)\s+(?:thư|email(?:s)?)\s+(.+)$/iu
const attachments = /(?:,?\s+trừ thư có tệp đính kèm|,?\s+except (?:email(?:s)?|mail) with attachments)$/iu
const age = /^(?:cũ hơn\s+(\d{1,3})\s+ngày|older than\s+(\d{1,3})\s+days?)$/iu
const before = /^(?:trước ngày|before)\s+(\d{4}-\d{2}-\d{2})$/iu
const from = /^(?:từ|from)\s+([^\s]+)$/iu
const date = z.iso.date()
const email = z.email().max(254)

export function parseOperatorCommand(command: string, accountId: string | null): OperatorSpec | null {
  const input = command.trim().normalize('NFC').replace(/[.]$/u, '').replace(/\s+/gu, ' ')
  const match = actionPattern.exec(input)
  if (!match) return null
  const action = /^(?:lưu trữ|archive)$/iu.test(match[1]) ? 'archive' : 'mark_read'
  const keepAttachments = attachments.test(match[2])
  const condition = match[2].replace(attachments, '')
  const spec: OperatorSpec = { action, accountId, keepAttachments, olderThanDays: null, beforeDate: null, sender: null }

  const days = age.exec(condition)
  if (days) {
    const value = Number(days[1] ?? days[2])
    return value >= 1 && value <= 365 ? { ...spec, olderThanDays: value } : null
  }
  const beforeDate = before.exec(condition)?.[1]
  if (beforeDate) return date.safeParse(beforeDate).success ? { ...spec, beforeDate } : null
  const sender = from.exec(condition)?.[1]
  return sender && email.safeParse(sender).success ? { ...spec, sender: sender.toLowerCase() } : null
}
