export const answerFields = {
  issueDate: 'Ngày phát hành hóa đơn',
  paymentDue: 'Hạn thanh toán',
  paymentDate: 'Ngày đã thanh toán',
  deliveryDate: 'Ngày giao hàng',
  invoiceTotal: 'Tổng tiền hóa đơn',
  outstandingAmount: 'Số tiền còn phải trả',
  paidAmount: 'Số tiền đã thanh toán',
} as const

export type AnswerField = keyof typeof answerFields
export type AnswerValue = { kind: 'date'; iso: string } |
  { kind: 'money'; currency: 'VND' | 'USD' | 'EUR'; minor: string }
export type AnswerCitation = {
  emailId: string
  version: string
  subject: string | null
  sender: string
  account: string | null
  at: string | null
  field: 'subject' | 'body_text'
  quote: string
}

export type AnswerObservation = { value: AnswerValue; citations: AnswerCitation[] }
export type AnswerClaim = {
  field: AnswerField
  status: 'supported' | 'conflicting' | 'missing' | 'unclear' | 'partial'
  observations: AnswerObservation[]
  moreValues: number
  unclear: AnswerCitation[]
}

export type AskAnswer = {
  reference: string | null
  status: 'answered' | 'conflicting' | 'insufficient' | 'partial'
  reason: 'reference_required' | 'multiple_references' | 'unsupported_question' | 'no_matching_mail' | null
  examined: number
  limited: boolean
  claims: AnswerClaim[]
}

export function formatAnswerValue(value: AnswerValue) {
  if (value.kind === 'date') return value.iso.split('-').reverse().join('/')
  const minor = value.currency === 'VND' ? value.minor : value.minor.padStart(3, '0')
  const digits = value.currency === 'VND' ? minor : minor.slice(0, -2)
  const whole = digits.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')
  return whole + (value.currency === 'VND' ? '' : ',' + minor.slice(-2)) + ' ' + value.currency
}
