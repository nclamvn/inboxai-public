import { z } from 'zod'
import { isQuotedMailBoundary } from '@/lib/email/plain-text'
import { detectDeliveryLine, type DeliveryProgress } from './delivery'
import type { CommitmentState } from './contracts'

export type DetectionSignal = {
  kind: 'create' | 'deadline' | 'owner' | 'progress' | 'completed' | 'cancelled' | 'review'
  quote: string
  title: string | null
  dueOn: string | null
  ownerEmail?: string
  priorDueOn?: string
  delivery?: DeliveryProgress
  proposedBatch?: { quantity: number; unit: DeliveryProgress['unit'] }
}

const speaker = '(?:tôi|chúng tôi|bên tôi|i|we)'
const promise = new RegExp('^' + speaker + ' (?:cam kết sẽ|sẽ|will|commit to) (.+)$', 'iu')
const deliveryVerb = '(?:gửi|bàn giao|giao|nộp|hoàn thành|hoàn tất|cung cấp|thanh toán|cập nhật|xác nhận|trả lời|send|submit|deliver|provide|pay|finish|complete|update|confirm|reply)'
const delivery = new RegExp('^' + deliveryVerb + '\\s+\\S', 'iu')
const dateToken = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})`
const relativeToken = '(?:ngày mai|hôm nay|tomorrow|today)'
const relativeDate = new RegExp('^' + relativeToken + '$', 'iu')
const deadline = new RegExp('^' + speaker + ' (?:(?:dời|đổi|lùi|chuyển) (?:hạn|hạn chót) (?:sang|đến)(?: ngày)?|(?:are moving|are changing|have moved|have changed) the deadline to) (' + dateToken + '|' + relativeToken + ')$', 'iu')
const confirmedReplacement = new RegExp('^đã (?:chốt|xác nhận) với [^:]+: [^:]+ sẽ (?:chuyển|gửi|giao|nộp|bàn giao|thanh toán) ngày (' + dateToken + '), thay lịch (' + dateToken + ')$', 'iu')
const confirmedDelivery = new RegExp('^(?:chốt chắc lịch rồi|đã (?:chốt|xác nhận) lịch): (.+) sẽ được bên (?:em|tôi) (' + deliveryVerb + ')( .+)$', 'iu')
const completion = new RegExp('^' + speaker + ' (?:đã (?:hoàn tất|hoàn thành) cam kết|have completed the commitment|đã (?:gửi|giao|bàn giao|nộp|đính kèm) .+ (?:và đã (?:hoàn tất|hoàn thành) cam kết|coi như xong phần việc .+))$', 'iu')
const cancellation = new RegExp('^' + speaker + ' (?:(?:đã )?hủy cam kết|have cancel(?:l)?ed the commitment)$', 'iu')
const reassignment = new RegExp('^' + speaker + ' (?:chuyển trách nhiệm cho|are assigning the commitment to) (\\S+)$', 'iu')
const dueSuffix = new RegExp(' (?:(?:trước ngày|chậm nhất ngày|vào ngày|ngày|trước|by|on) (' + dateToken + ')|(?:vào |trước |chậm nhất |by |on )?(' + relativeToken + '))$', 'iu')
const uncertain = /(?:^|[\s,(])(?:nếu|trừ khi|có thể|có lẽ|dự kiến|cố gắng|if|unless|might|may|try to|subject to)(?=[\s,)]|$)/iu
const uncertainUpdate = new RegExp('^' + speaker + ' (?:(?:có thể|dự kiến) (?:dời|đổi|lùi|chuyển) (?:hạn|lịch giao)\\b|(?:chưa thể|chưa) xác nhận (?:hạn|lịch giao)\\b|(?:may|might) (?:move|change) the deadline\\b|(?:cannot|can.t) confirm the (?:delivery date|deadline)\\b)', 'iu')

function calendarDate(raw: string, receivedAt: string | null) {
  if (relativeDate.test(raw)) {
    const received = receivedAt ? Date.parse(receivedAt) : NaN
    const tomorrow = /^(?:ngày mai|tomorrow)$/iu.test(raw)
    const local = new Date(received + (tomorrow ? 31 : 7) * 3_600_000)
    const iso = Number.isFinite(local.valueOf()) ? local.toISOString().split('T')[0] : ''
    return z.iso.date().safeParse(iso).success ? iso : null
  }
  const [day, month, year] = raw.split('/')
  const iso = year ? year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') : raw
  return z.iso.date().safeParse(iso).success ? iso : null
}

export function subjectReference(subject: string | null) {
  if (!subject || subject.length > 500) return null
  const tokens = new Set(subject.toUpperCase().match(/\b[A-Z]{2,12}-\d{1,12}\b/g))
  return tokens.size === 1 ? [...tokens][0] : null
}

export function commitmentTitleKey(title: string) {
  return title.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

export function detectCommitments(body: string | null, receivedAt: string | null = null, reference: string | null = null): DetectionSignal[] {
  if (!body || body.length > 8000 || body.includes('\0')) return []
  const signals: DetectionSignal[] = []
  for (const raw of body.split(/\r?\n/u)) {
    const quote = raw.trim()
    if (isQuotedMailBoundary(quote)) break
    if (!quote || quote.length > 480) continue
    const line = quote.normalize('NFC').replace(/\s+/gu, ' ').replace(/[.!]$/u, '')
    if (/[?;"“”]/u.test(line)) continue
    if (uncertainUpdate.test(line)) {
      signals.push({ kind: 'review', quote, title: null, dueOn: null })
      continue
    }
    if (uncertain.test(line)) continue
    const deliveryEvent = reference?.startsWith('PO-') && detectDeliveryLine(line, quote, value => calendarDate(value, receivedAt))
    if (deliveryEvent) {
      signals.push(deliveryEvent)
      continue
    }
    const replacement = confirmedReplacement.exec(line)
    if (replacement) {
      const dueOn = calendarDate(replacement[1], receivedAt)
      const priorDueOn = calendarDate(replacement[2], receivedAt)
      if (dueOn && priorDueOn) signals.push({ kind: 'deadline', quote, title: null, dueOn, priorDueOn })
      continue
    }
    const move = deadline.exec(line)
    if (move) {
      const dueOn = calendarDate(move[1], receivedAt)
      if (dueOn) signals.push({ kind: 'deadline', quote, title: null, dueOn })
      continue
    }
    if (completion.test(line) || cancellation.test(line)) {
      signals.push({ kind: completion.test(line) ? 'completed' : 'cancelled', quote, title: null, dueOn: null })
      continue
    }
    const assignment = reassignment.exec(line)
    if (assignment) {
      const ownerEmail = senderIdentity(assignment[1])
      if (ownerEmail) signals.push({ kind: 'owner', quote, title: null, dueOn: null, ownerEmail })
      continue
    }
    const pledge = promise.exec(line)
    const confirmed = confirmedDelivery.exec(line)
    const action = confirmed ? confirmed[2] + ' ' + confirmed[1] + confirmed[3] : pledge?.[1]
    if (!action || !delivery.test(action) || action.includes(':')) continue
    const suffix = dueSuffix.exec(action)
    const dueOn = suffix ? calendarDate(suffix[1] ?? suffix[2], receivedAt) : null
    if (suffix && !dueOn) continue
    if (confirmed && !dueOn) continue
    const title = action.slice(0, suffix?.index ?? action.length).trim()
    if (title.length <= 200) signals.push({ kind: 'create', quote, title, dueOn })
  }
  if (signals.length <= 1) return signals
  if (signals.some(signal => signal.kind !== 'create')) return []
  const distinct = new Map<string, DetectionSignal>()
  for (const signal of signals) {
    const key = commitmentTitleKey(signal.title!)
    const existing = distinct.get(key)
    if (existing && existing.dueOn !== signal.dueOn) return []
    if (!existing) distinct.set(key, signal)
  }
  return distinct.size <= 4 ? [...distinct.values()] : []
}

export function senderIdentity(sender: string) {
  const address = sender.trim().toLowerCase()
  return z.email().max(254).safeParse(address).success ? address : null
}

export function proposedState(signal: DetectionSignal, sender: string, name: string | null, prior: CommitmentState | null): CommitmentState | null {
  if (signal.kind === 'review') return null
  if (signal.kind === 'create') {
    if (prior || !signal.title) return null
    return {
      title: signal.title, ownerName: name?.trim() || null, ownerEmail: sender,
      dueOn: signal.dueOn, dueAt: null, status: 'open',
      ...(signal.delivery && { delivery: signal.delivery }),
    }
  }
  if (prior?.status !== 'open') return null
  const { title, ownerName, ownerEmail, dueOn, dueAt, status, delivery } = prior
  const quantities = delivery ? { delivery } : {}
  if (signal.delivery) {
    if (!delivery || signal.delivery.delivered <= delivery.delivered || signal.delivery.ordered !== delivery.ordered ||
        signal.delivery.unit !== delivery.unit) return null
    return { title, ownerName, ownerEmail, dueOn, dueAt, status: signal.kind === 'completed' ? 'completed' : 'open', delivery: signal.delivery }
  }
  if (signal.kind === 'progress' || (signal.kind === 'completed' && delivery)) return null
  if (signal.kind === 'deadline') {
    if (dueOn === signal.dueOn && !dueAt) return null
    return { title, ownerName, ownerEmail, dueOn: signal.dueOn, dueAt: null, status, ...quantities }
  }
  if (signal.kind === 'owner') {
    if (!signal.ownerEmail || ownerEmail?.toLowerCase() === signal.ownerEmail) return null
    return { title, ownerName: null, ownerEmail: signal.ownerEmail, dueOn, dueAt, status, ...quantities }
  }
  return { title, ownerName, ownerEmail, dueOn, dueAt, status: signal.kind, ...quantities }
}
