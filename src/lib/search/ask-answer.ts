import { detectDeliveryLine } from '@/lib/commitments/delivery'
import { isQuotedMailBoundary } from '@/lib/email/plain-text'
import { answerFields, type AnswerCitation, type AnswerClaim, type AnswerField, type AnswerObservation, type AskAnswer } from './ask-answer-contracts'
import { readAnswerDate, readAnswerMoney } from './ask-answer-values'

type Plan = { reference: string; fields: AnswerField[] | null; warehouse?: true; payment?: true }
type PlanResult = { plan: Plan } | { reason: NonNullable<AskAnswer['reason']> }

export type AnswerSource = {
  id: string
  version: string
  subject: string | null
  body: string | null
  subjectClipped: boolean
  bodyClipped: boolean
  sender: string
  account: string | null
  at: string | null
}

export type AnswerEvidence = { sources: AnswerSource[]; capped: boolean }

const referencePattern = /(?<![\p{L}\p{N}_-])[A-Za-z]{2,12}-[0-9]{1,16}(?![\p{L}\p{N}_-])/gu
const fieldKeys = Object.keys(answerFields) as AnswerField[]
const moneyFields = new Set<AnswerField>(['invoiceTotal', 'outstandingAmount', 'paidAmount'])
const questions: Record<AnswerField, RegExp> = {
  issueDate: /(?:ngày phát hành|ngày lập hóa đơn|invoice date|issue date|issued when)/iu,
  paymentDue: /(?:hạn thanh toán|hạn trả tiền|phải trả khi nào|payment due|due date|pay by|payment deadline)/iu,
  paymentDate: /(?:ngày (?:đã )?thanh toán|ngày đã trả|trả (?:tiền )?(?:ngày nào|khi nào)|payment date|when (?:was it |was .* )?paid|paid on)/iu,
  deliveryDate: /(?:ngày giao|hạn giao|lịch giao|giao (?:hàng )?(?:khi nào|ngày nào|bao giờ)|delivery date|delivery deadline|when .* deliver)/iu,
  invoiceTotal: /(?:tổng (?:số )?tiền (?:của )?hóa đơn|giá trị hóa đơn|(?:số )?tiền hóa đơn|hóa đơn .*bao nhiêu|invoice total|invoice amount|total invoice)/iu,
  outstandingAmount: /(?:còn (?:phải )?(?:trả|thanh toán|nợ)|dư nợ|số dư phải trả|amount due|outstanding (?:amount|balance)|balance due)/iu,
  paidAmount: /(?:số tiền đã (?:trả|thanh toán)|đã (?:thanh toán|trả)(?: được)? (?:bao nhiêu|số tiền)|amount paid|how much .*paid|payment received)/iu,
}

function references(text: string) {
  return [...new Set((text.match(referencePattern) ?? []).map(value => value.toUpperCase()))]
}

export function planAskAnswer(question: string): PlanResult {
  const codes = references(question)
  if (codes.length === 0) return { reason: 'reference_required' }
  if (codes.length > 1) return { reason: 'multiple_references' }
  const reference = codes[0]
  const asksPaymentMatch = /(?:ba bên|đơn giá|đủ (?:căn cứ |điều kiện )?thanh toán|trước thanh toán|đối (?:soát|chiếu).*(?:hóa đơn|hoá đơn)|(?:hóa đơn|hoá đơn).*(?:chênh lệch|sai|khớp|thiếu))/iu.test(question)
  if (reference.startsWith('PO-') && asksPaymentMatch) {
    return { plan: { reference, fields: fieldKeys.filter(key => questions[key].test(question)), payment: true } }
  }
  if (reference.startsWith('PO-') && /(?:đối soát|nhập kho|đính chính|mở lại|thực nhận|kho (?:đã )?nhận|còn thiếu|thiếu bao nhiêu|từng dòng|dòng nào|thừa bao nhiêu)/iu.test(question)) {
    return { plan: { reference, fields: [], warehouse: true } }
  }
  const fields = fieldKeys.filter(key => questions[key].test(question))
  if (fields.length && !fields.some(field => moneyFields.has(field)) && /(?:số tiền|bao nhiêu tiền|how much)/iu.test(question)) {
    fields.push(...moneyFields)
  }
  if (fields.length) return { plan: { reference, fields } }
  if (question.trim().toUpperCase() === reference ||
    /(?:tóm tắt|tổng hợp|đối chiếu|thông tin|ngày và số tiền|summary|summari[sz]e|dates and amounts)/iu.test(question)) {
    return { plan: { reference, fields: null } }
  }
  return { reason: 'unsupported_question' }
}

export function emptyAskAnswer(reason: NonNullable<AskAnswer['reason']>): AskAnswer {
  return { reference: null, status: 'insufficient', reason, examined: 0, limited: false, claims: [] }
}

const labels: Record<AnswerField, [string, string]> = {
  issueDate: ['ngày (?:phát hành|lập) hóa đơn', 'invoice date|invoice issue date'],
  paymentDue: ['hạn thanh toán|hạn trả tiền', 'payment due(?: date)?|payment deadline|pay by'],
  paymentDate: ['ngày (?:đã )?thanh toán|ngày đã trả|đã thanh toán ngày', 'payment date|paid on'],
  deliveryDate: ['ngày giao(?: hàng)?|hạn giao(?: hàng)?|lịch giao(?: hàng)?', 'delivery date|scheduled delivery|delivery deadline'],
  invoiceTotal: ['tổng (?:số )?tiền hóa đơn|giá trị hóa đơn|số tiền hóa đơn', 'invoice total|invoice amount|total invoice amount'],
  outstandingAmount: ['số tiền còn (?:phải )?(?:trả|thanh toán)|còn phải thanh toán|dư nợ', 'amount due|outstanding (?:amount|balance)|balance due'],
  paidAmount: ['số tiền đã (?:thanh toán|trả)|đã thanh toán|đã trả', 'amount paid|payment received'],
}
const matchers = fieldKeys.map(field => ({
  field,
  regex: new RegExp('^(?:(' + labels[field][0] + ')|(' + labels[field][1] + '))(?=$|[\\s:=—–])\\s*(.*)$', 'iu'),
}))
const tentative = /(?:^|[^\p{L}\p{N}_])(?:dự kiến|dự thảo|ước tính|ước lượng|tạm tính|đề xuất|chưa xác nhận|chưa thanh toán|nếu|có thể|chờ duyệt|draft|tentative|estimated|approximately|proposed|pending approval|unconfirmed|if|unless)(?=$|[^\p{L}\p{N}_])/iu
const draftHeading = /^(?:bản nháp|bản dự thảo|dự thảo|đề xuất|draft(?: only)?|tentative|pending approval)[. :：]*$/iu
const possiblePrefix = /^(?:[:=—–]\s*|(?:là|is|vào)\s+)+/iu
const summaryLimit = 6
const citationLimit = 3

function currentBody(source: AnswerSource) {
  const lines = (source.body ?? '').split(/\r?\n/u)
  if (source.bodyClipped) lines.pop()
  const boundary = lines.findIndex(line => isQuotedMailBoundary(line.trim()))
  return (boundary < 0 ? lines : lines.slice(0, boundary)).join('\n')
}

function sourceFacts(source: AnswerSource, reference: string) {
  const body = currentBody(source)
  const subject = source.subjectClipped ? '' : source.subject ?? ''
  const sourceCodes = references(subject + '\n' + body)
  if (!sourceCodes.includes(reference)) return []
  // Strip reference markup from interpretation only. The citation keeps the original quote.
  const prefix = new RegExp('^\\[?' + reference + '\\]?(?=[\\s:—–,]|$)\\s*[:—–,]?\\s*', 'iu')
  const suffix = new RegExp('\\s+\\(?\\[?' + reference + '\\]?\\)?[.!]?$', 'iu')
  const quotes: { field: AnswerCitation['field']; quote: string; conditional: boolean }[] = []
  let conditional = false
  const lines = body.split(/\r?\n/u)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) conditional = false
    const tentativeLine = tentative.test(trimmed)
    if ((/[:：]$/u.test(trimmed) && tentativeLine) || draftHeading.test(trimmed)) conditional = true
    for (const clause of trimmed.split(/(?<=[.!?;])\s+(?=\p{Lu})/u)) {
      quotes.push({ field: 'body_text', quote: clause, conditional: conditional || tentativeLine })
    }
  }
  if (subject && !/^(?:re|fw|fwd)\s*:/iu.test(subject)) quotes.push({ field: 'subject', quote: subject.trim(), conditional: false })
  const sourceTentative = tentative.test(subject) || tentative.test(lines.find(line => line.trim()) ?? '')

  return quotes.flatMap(({ field, quote, conditional }) => {
    if (!quote || quote.length > 500) return []
    const codes = references(quote)
    if (codes.some(code => code !== reference) || (sourceCodes.length > 1 && !codes.includes(reference))) return []
    const statement = quote.replace(prefix, '')
    const citation: AnswerCitation = {
      emailId: source.id, version: source.version, sender: source.sender, account: source.account,
      subject: source.subject, at: source.at, field, quote,
    }
    if (reference.startsWith('PO-') && field === 'body_text') {
      const delivery = detectDeliveryLine(statement.normalize('NFC').replace(/\s+/gu, ' ').replace(/[.!]$/u, ''),
        quote, value => {
          const parsed = readAnswerDate(value, 'vi')
          return parsed?.kind === 'date' ? parsed.iso : null
        })
      if (delivery?.dueOn) {
        return [{ claim: 'deliveryDate' as const, value: delivery.kind === 'review' || sourceTentative || conditional
          ? null : { kind: 'date' as const, iso: delivery.dueOn }, citation }]
      }
    }
    const { regex, field: claim } = matchers.find(matcher => matcher.regex.test(statement)) ?? {}
    const match = regex?.exec(statement)
    if (!match || !claim) return []
    let raw = match[3].replace(possiblePrefix, '').replace(prefix, '').replace(suffix, '').replace(/[.!;]$/u, '').trim()
    // A delivery subject can name the topic without making a date claim.
    if (field === 'subject' && claim === 'deliveryDate' && !/^(?:\d|[a-z]+\s+\d)/iu.test(raw)) return []
    if (match[1]) raw = raw.replace(/^ngày\s+/iu, '')
    const uncertain = sourceTentative || conditional || tentative.test(quote)
    const language = match[1] ? 'vi' : 'en'
    const payment = claim === 'paidAmount' ? /^(.+?)\s+(?:vào ngày|ngày|on)\s+(.+)$/iu.exec(raw) : null
    if (payment) {
      return [
        { claim, value: uncertain ? null : readAnswerMoney(payment[1]), citation },
        { claim: 'paymentDate' as const, value: uncertain ? null : readAnswerDate(payment[2], language), citation },
      ]
    }
    const value = uncertain ? null : moneyFields.has(claim) ? readAnswerMoney(raw) : readAnswerDate(raw, language)
    return [{ claim, value, citation }]
  })
}

function addCitation(citations: AnswerCitation[], citation: AnswerCitation) {
  if (citations.length < citationLimit && !citations.some(existing =>
    existing.emailId === citation.emailId && existing.field === citation.field && existing.quote === citation.quote)) {
    citations.push(citation)
  }
}

export function synthesizeAskAnswer(plan: Plan, evidence: AnswerEvidence): AskAnswer {
  const limited = evidence.capped || evidence.sources.some(source => source.bodyClipped || source.subjectClipped)
  const fields = new Map<AnswerField, { values: Map<string, AnswerObservation>; unclear: AnswerCitation[] }>()
  for (const field of plan.fields ?? fieldKeys) fields.set(field, { values: new Map(), unclear: [] })
  for (const source of evidence.sources) {
    for (const { claim, value, citation } of sourceFacts(source, plan.reference)) {
      const group = fields.get(claim)
      if (!group) continue
      if (!value) {
        addCitation(group.unclear, citation)
        continue
      }
      const key = value.kind === 'date' ? value.iso : value.currency + ':' + value.minor
      const observation = group.values.get(key) ?? { value, citations: [] }
      addCitation(observation.citations, citation)
      group.values.set(key, observation)
    }
  }

  const claims: AnswerClaim[] = []
  for (const [field, { values, unclear }] of fields) {
    if (!plan.fields && !values.size && !unclear.length) continue
    const status = values.size > 1 ? 'conflicting' : unclear.length ? 'unclear'
      : values.size === 0 ? 'missing' : limited ? 'partial' : 'supported'
    claims.push({
      field, status, observations: [...values.values()].slice(0, summaryLimit),
      moreValues: Math.max(0, values.size - summaryLimit), unclear,
    })
  }

  const supported = claims.filter(claim => claim.status === 'supported').length
  const status = claims.some(claim => claim.status === 'conflicting') ? 'conflicting'
    : supported > 0 && supported === claims.length ? 'answered'
    : claims.some(claim => claim.observations.length > 0) ? 'partial' : 'insufficient'
  return {
    reference: plan.reference, status,
    reason: evidence.sources.length === 0 ? 'no_matching_mail' : null,
    examined: evidence.sources.length, limited, claims,
  }
}
