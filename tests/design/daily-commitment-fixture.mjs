import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export function dailyCommitmentFixture(identity, now = Date.now()) {
  const date = days => new Date(now + (days * 24 + 7) * 3_600_000).toISOString().slice(0, 10)
  const oldDue = date(-2), today = date(0), newDue = date(2)
  const title = 'giao bộ ống dẫn cho dây chuyền số 4'
  const vendor = 'thu-hydraulics@example.test'
  const reference = 'VT-78416'
  const row = (id, account, sender, subject, body, hours, category = 'work') => ({
    id, account, sender, subject, body, at: new Date(now + hours * 3_600_000).toISOString(), category,
  })
  const initial = [
    row('a1', 'work', vendor, 'Xác nhận lô ống dẫn [VT-78416]', `Tôi sẽ ${title} trước ngày ${oldDue}.`, -96),
    row('b1', 'work', identity, 'Biên bản kiểm đếm [KT-22860]', `Tôi sẽ nộp biên bản kiểm đếm trước ngày ${today}.`, -22),
    row('c1', 'finance', 'dat@valves.example.test', 'Chứng nhận vật liệu [CN-18532]', `Chúng tôi sẽ gửi chứng nhận vật liệu trước ngày ${date(7)}.`, -20),
    row('d1', 'finance', 'le@lab.example.test', 'Mẫu kiểm thử [TN-52061]', `Tôi sẽ giao mẫu kiểm thử trước ngày ${date(-1)}.`, -75),
    row('d2', 'finance', 'le@lab.example.test', 'Ký nhận mẫu [TN-52061]', 'Tôi đã hoàn tất cam kết.', -13),
    row('noise', 'work', 'offers@catalogue.example.test', 'Ưu đãi khẩn trong hôm nay', 'Chương trình thiết bị giảm giá đến hết hôm nay.', -1, 'newsletter'),
    row('third', 'finance', 'dispatch@broker.example.test', 'Re: Lịch xe [VT-78416]', `Chúng tôi dời hạn sang ngày ${date(15)}.\nChúng tôi chỉ đặt xe, không xác nhận lịch thay nhà cung cấp.`, -3),
  ]
  const replies = [
    row('a2', 'work', vendor, 'Re: Đang chờ xe [VT-78416]', 'Tôi chưa thể xác nhận lịch giao, bên vận chuyển vẫn đang bố trí xe.', 1),
    row('a3', 'work', vendor, 'Re: Đã chốt lịch giao [VT-78416]', `Tôi dời hạn sang ngày ${newDue}.`, 2),
    row('a4', 'work', vendor, 'Re: Kho đã ký nhận [VT-78416]', 'Tôi đã giao bộ ống dẫn và đã hoàn tất cam kết.', 3),
  ]
  return { today, oldDue, newDue, title, vendor, reference, initial, replies }
}

export async function seedDailyCommitments({ email, userId, admin, appFetch, fixture, compareAcrossAccounts = false }) {
  const detectionPath = '/api/commitments/detections'
  const json = { 'Content-Type': 'application/json' }
  const corpus = dailyCommitmentFixture(email)
  const accounts = { work: fixture.work, finance: fixture.accounting.source_account_id }
  const messages = new Map()
  await admin.from('emails').delete().eq('user_id', userId)
    .in('id', [fixture.original.id, fixture.moved.id, fixture.accounting.id])
    .throwOnError()
  await admin.from('emails').delete().eq('user_id', userId).eq('from_address', 'newsletter@example.test').throwOnError()

  async function add(sample, receivedAt = sample.at) {
    const id = randomUUID()
    const row = {
      id, user_id: userId, source_account_id: accounts[sample.account], from_address: sample.sender,
      message_id: '<' + id + '@fixture.example.test>', subject: sample.subject, body_text: sample.body, snippet: sample.body,
      received_at: receivedAt, created_at: receivedAt, direction: 'inbound', body_fetched: true,
      category: sample.category, is_read: sample.id === 'a1', is_archived: false,
    }
    await admin.from('emails').insert(row).throwOnError()
    messages.set(sample.id, row)
    return row
  }

  async function appJson(path, init, expected = 200) {
    const response = await appFetch(path, init)
    const body = await response.json()
    assert.equal(response.status, expected, JSON.stringify(body))
    return body
  }
  async function confirmSetup(sourceId) {
    const scan = await appJson(detectionPath)
    const proposal = scan.proposals.find(item => item.emailId === messages.get(sourceId).id && item.review)
    assert.ok(proposal, sourceId)
    const command = proposal.review.command
    return appJson(detectionPath, {
      method: 'POST', headers: { ...json, 'Idempotency-Key': randomUUID() }, body: JSON.stringify(command),
    }, command.operation === 'create' ? 201 : 200)
  }

  if (compareAcrossAccounts) {
    const original = corpus.initial[0]
    original.body += '\nNgày giao hàng: ' + corpus.oldDue + '.'
    corpus.initial.push({
      id: 'finance-date', account: 'finance', sender: 'lien-ke-toan@example.test',
      subject: 'Đối chiếu lịch giao [VT-78416]',
      body: 'Ngày giao hàng: ' + corpus.newDue + '.\nKế toán ghi nhận lịch cập nhật, đang chờ nhà cung cấp xác nhận.',
      at: corpus.initial.find(mail => mail.id === 'third').at, category: 'work',
    })
    corpus.replies[1].body += '\nNgày giao hàng: ' + corpus.newDue + '.'
  }
  for (const sample of corpus.initial) await add(sample)
  const main = await confirmSetup('a1')
  const own = await confirmSetup('b1')
  await confirmSetup('c1')
  await confirmSetup('d1')
  await confirmSetup('d2')

  return { corpus, accounts, messages, add, appJson, main, own }
}
