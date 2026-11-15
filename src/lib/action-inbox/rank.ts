import type { Email, InboxPriority } from '@/types'

export type InboxBand = 'action' | 'primary' | 'later'
type Signal = 'alert' | 'deadline' | 'reply' | 'star' | 'receipt' | 'bulk' | 'spam' | 'default' | 'manual' | 'history'

type RankInput = Pick<Email, 'id' | 'subject' | 'from_address' | 'source_account_id' | 'received_at' |
  'category' | 'detected_deadline' | 'needs_reply' | 'is_starred' | 'inbox_priority'> &
  Partial<Pick<Email, 'snippet'>>

interface Source {
  emailId: string
  subject: string | null
  excerpt?: string
}

export interface PriorityReason {
  signal: Signal
  label: string
  sources: Source[]
  date?: string
}

export interface InboxRanking {
  emailId: string
  band: InboxBand
  strength: number
  deadline?: number
  received: number
  preference: number
  reasons: PriorityReason[]
}

export const inboxBandLabels: Record<InboxBand, string> = {
  action: 'Cần xử lý',
  primary: 'Hộp thư chính',
  later: 'Đọc sau',
}

const day = 24 * 60 * 60 * 1000
const alertPattern = /(?:sự cố (?:đang xảy ra|sản xuất|bảo mật|mất điện)|hệ thống (?:ngừng hoạt động|bị gián đoạn)|dừng (?:dây chuyền|sản xuất)|đăng nhập (?:bất thường|đáng ngờ)|giao dịch (?:bất thường|đáng ngờ)|\b(?:production outage|service outage|security alert|suspicious (?:login|activity|transaction)|unauthorized (?:login|transaction)|fraud alert)\b)/iu
const closedAlert = /(?:diễn tập|bản tin|mô phỏng|giả lập|dự kiến[^.!?\n]{0,100}để bảo trì|đã (?:khắc phục|xử lý)|không (?:có|phải) sự cố|\b(?:drill|simulation|resolved|retrospective|postmortem|newsletter|no outage|planned maintenance)\b)/iu
const receiptPattern = /(?:giao dịch (?:thành công|đã được ghi nhận)|(?:thanh toán|chuyển khoản) thành công|biên lai thanh toán|\b(?:payment (?:received|successful|confirmation)|transaction (?:successful|completed)|transfer complete)\b)/iu
const replyPattern = /(?:vui lòng (?:xác nhận|phản hồi|phê duyệt|đối chiếu)|nhờ (?:bạn |anh |chị )?(?:xác nhận|phản hồi|phê duyệt)|xin (?:ý kiến|phê duyệt|phản hồi)|\b(?:please (?:confirm|respond|approve|review)|action required|approval needed)\b)/iu
const automatedSender = /(?:^|[._+-])(?:no-?reply|do-?not-?reply|mailer-daemon|bounce)(?:@|[._+-])/i

function instant(value: string | null): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function source(email: RankInput, excerpt?: string): Source {
  return { emailId: email.id, subject: email.subject, excerpt }
}

function findSignal(email: RankInput, pattern: RegExp): string | undefined {
  return email.subject?.slice(0, 512).match(pattern)?.[0] || email.snippet?.slice(0, 480).match(pattern)?.[0]
}

function classify(email: RankInput, now: number): InboxRanking {
  const received = instant(email.received_at)
  const result = (band: InboxBand, strength: number, reasons: PriorityReason[], deadline?: number): InboxRanking =>
    ({ emailId: email.id, band, strength, received, deadline, preference: 0, reasons })
  const reason = (signal: Signal, label: string, excerpt?: string): PriorityReason =>
    ({ signal, label, sources: [source(email, excerpt)] })

  if (email.inbox_priority === 'action' || email.inbox_priority === 'later') {
    const choice = email.inbox_priority
    return result(choice, choice === 'action' ? 6 : 0, [
      reason('manual', `Bạn đã chọn ${inboxBandLabels[choice].toLowerCase()} cho thư này.`),
    ])
  }

  if (email.category === 'spam') {
    return result('later', 0, [reason('spam', 'Thư được phân loại là spam.')])
  }

  const alert = findSignal(email, alertPattern)
  if (alert && !findSignal(email, closedAlert) && received >= now - 7 * day && received <= now) {
    return result('action', 7, [reason('alert', 'Thư gần đây có dấu hiệu gián đoạn hoặc cảnh báo bảo mật.', alert)])
  }

  const reply = findSignal(email, replyPattern)
  const receipt = findSignal(email, receiptPattern)
  if (receipt && !reply) {
    return result('later', 0, [reason('receipt', 'Thư xác nhận giao dịch đã hoàn tất.', receipt)])
  }

  if ((email.category === 'newsletter' || email.category === 'promotion') && !email.is_starred) {
    return result('later', 0, [reason('bulk', 'Thư được phân loại là bản tin hoặc khuyến mãi.')])
  }

  const reasons: PriorityReason[] = []
  const due = instant(email.detected_deadline)
  if (due && received && received <= now && due >= received && due >= now - 7 * day && due <= now + 2 * day) {
    reasons.push({
      ...reason('deadline', due < now ? 'Hạn đã nhận diện vừa qua.' : 'Hạn đã nhận diện trong vòng 48 giờ.'),
      date: email.detected_deadline!,
    })
  }
  if (!automatedSender.test(email.from_address) && (reply || email.needs_reply)) {
    reasons.push(reason('reply', reply ? 'Thư có lời đề nghị phản hồi hoặc xác nhận.' : 'Phân tích trước đó đánh dấu thư cần phản hồi.', reply))
  }
  if (email.is_starred) reasons.push(reason('star', 'Bạn đã gắn sao thư này.'))
  if (reasons.length > 0) {
    return result('action', reasons[0].signal === 'deadline' ? 4 : reasons[0].signal === 'reply' ? 3 : 2,
      reasons, reasons[0].signal === 'deadline' ? due : undefined)
  }
  return result('primary', 0, [reason('default', 'Chưa thấy tín hiệu cần đưa thư lên trước.')])
}

function senderKey(email: RankInput): string | null {
  const sender = email.from_address.trim().toLowerCase()
  return email.source_account_id && sender ? `${email.source_account_id}/${sender}` : null
}

function newest(a: { received: number; emailId: string }, b: { received: number; emailId: string }): number {
  return b.received - a.received || b.emailId.localeCompare(a.emailId)
}

/** Uses only the supplied tenant's loaded mail. Past choices change order within a band. */
export function rankActionInbox(emails: readonly RankInput[], now: number): Map<string, InboxRanking> {
  const corrections = new Map<string, { email: RankInput; received: number; emailId: string }[]>()
  for (const email of emails) {
    if (!email.inbox_priority) continue
    const key = senderKey(email)
    const received = instant(email.received_at)
    if (!key || received < now - 90 * day || received > now) continue
    const latest = corrections.get(key) || []
    corrections.set(key, [...latest, { email, received, emailId: email.id }].sort(newest).slice(0, 2))
  }

  return new Map(emails.map(email => {
    const ranking = classify(email, now)
    const key = senderKey(email)
    const history = key && corrections.get(key)
    if (!email.inbox_priority && ranking.band !== 'later' && ranking.strength < 4 && history && history.length === 2) {
      const [first, second] = history
      const preference: InboxPriority | undefined = first.email.inbox_priority
      if (preference && preference === second.email.inbox_priority) {
        ranking.preference = preference === 'action' ? 1 : -1
        ranking.reasons.push({
          signal: 'history',
          label: `Bạn đã chọn ${inboxBandLabels[preference].toLowerCase()} cho hai thư gần đây từ cùng người gửi trong tài khoản này.`,
          sources: [source(first.email), source(second.email)],
        })
      }
    }
    return [email.id, ranking]
  }))
}

export function compareInboxPriority(a: InboxRanking, b: InboxRanking): number {
  const bandOrder = { action: 0, primary: 1, later: 2 }
  return bandOrder[a.band] - bandOrder[b.band] ||
    b.strength - a.strength ||
    (a.deadline ?? 0) - (b.deadline ?? 0) ||
    b.preference - a.preference ||
    newest(a, b)
}
