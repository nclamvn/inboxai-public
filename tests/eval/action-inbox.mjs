import assert from 'node:assert/strict'
import { rankActionInbox } from '../../src/lib/action-inbox/rank.ts'

// Synthetic acceptance probes separate from the unit fixtures. These labels were
// authored for the evaluation and have not been independently or blindly judged.
const now = Date.parse('2026-11-11T12:00:00Z')
const samples = [
  ['factory-stop', 'Khu vực đóng gói dừng sản xuất do lỗi nguồn', true, { priority: 1, is_read: true }],
  ['new-sender-security', 'Thông báo đăng nhập đáng ngờ từ thiết bị mới', true, { category: 'transaction', priority: 2 }],
  ['spanish-incident', 'Interrupción crítica del servicio de cobros', true, { priority: 5 }],
  ['receipt-overclassified', 'Biên lai thanh toán cho đơn D184', false, { category: 'transaction', priority: 5 }],
  ['transfer-success', 'Chuyển khoản thành công', false, { category: 'transaction', needs_reply: true }],
  ['invoice-not-receipt', 'Đề nghị xác nhận phương án thanh toán', true, { needs_reply: true, is_read: true }],
  ['explicit-approval', 'Please approve the replacement order', true, { priority: 3 }],
  ['source-body', 'Đơn mua 093', true, { snippet: 'Tệp đã đính kèm. Nhờ chị phê duyệt đơn trước khi chốt.' }],
  ['implicit-vietnamese', 'Bạn gửi giúp mình thông số lô 45 được không?', true, {}],
  ['recent-overdue', 'Bản duyệt kế hoạch nhận hàng', true, { detected_deadline: '2026-11-11T09:00:00Z', is_read: true }],
  ['upcoming-deadline', 'Chốt danh sách tiếp nhận kho', true, { detected_deadline: '2026-11-12T09:00:00Z' }],
  ['distant-deadline', 'Lịch nộp báo cáo tháng sau', false, { detected_deadline: '2026-12-02T09:00:00Z' }],
  ['old-deadline', 'Hạn gửi bản cứng kỳ trước', false, { received_at: '2026-10-10T08:00:00Z', detected_deadline: '2026-10-11T08:00:00Z' }],
  ['alert-resolved', 'Production outage resolved at 09:18', false, { priority: 5 }],
  ['planned-stop', 'Thông báo dừng sản xuất dự kiến thứ Bảy để bảo trì', false, { priority: 3 }],
  ['incident-drill', 'Tài liệu diễn tập sự cố bảo mật', false, { priority: 5 }],
  ['automated-reply', 'Please confirm your notification preferences', false, { from_address: 'no-reply@example.test', needs_reply: true }],
  ['newsletter', 'Bản tin ngành tháng 11', false, { category: 'newsletter', priority: 4 }],
  ['user-star', 'Số liệu cần đối chiếu cuối kỳ', true, { is_starred: true, is_read: true }],
  ['vip-without-request', 'Đã nhận được tài liệu', false, { priority: 5, from_address: 'director@example.test' }],
  ['plain-fraud', 'Fraud alert for your card', true, { priority: 1, category: 'transaction' }],
  ['far-body', 'Tài liệu nghiệm thu', true, { snippet: ' '.repeat(480) + 'Please approve this report.' }],
  ['spam-spoof', 'Security alert', false, { category: 'spam', priority: 5 }],
  ['normal-no-signal', 'Lịch phân ca đã cập nhật', false, {}],
]

const emails = samples.map(([id, subject, expectedAction, fields]) => ({
  id, subject, expectedAction, from_address: 'sender@example.test', source_account_id: 'demo',
  received_at: '2026-11-11T08:00:00Z', priority: 3, category: 'work', is_read: false,
  needs_reply: false, detected_deadline: null, is_starred: false, ...fields,
}))
const newRanking = rankActionInbox(emails, now)
const metrics = decide => {
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 }
  const misses = []
  for (const email of emails) {
    const action = decide(email)
    if (action !== email.expectedAction) misses.push({ case: email.id, expectedAction: email.expectedAction, action })
    if (email.expectedAction) counts[action ? 'truePositive' : 'falseNegative']++
    else counts[action ? 'falsePositive' : 'trueNegative']++
  }
  return {
    ...counts,
    precision: counts.truePositive / (counts.truePositive + counts.falsePositive),
    recall: counts.truePositive / (counts.truePositive + counts.falseNegative),
    misses,
  }
}
for (const rank of newRanking.values()) {
  assert.ok(rank.reasons.length > 0)
  assert.ok(rank.reasons.every(reason => reason.sources.length > 0 && reason.sources.every(source => newRanking.has(source.emailId))))
}

console.log(JSON.stringify({
  provenance: '24 author-labelled synthetic cases, no independent review, provider, LLM or agent run',
  cases: emails.length,
  baseline: metrics(email => !email.is_read && Boolean(email.priority >= 4 || email.needs_reply || email.detected_deadline)),
  actionInbox: metrics(email => newRanking.get(email.id).band === 'action'),
  allReasonsReferenceFixtureEmail: true,
}, null, 2))
