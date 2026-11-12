import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { audit } from './browser.mjs'

const endpoint = '/api/commitments/detections'
const collection = '/api/commitments'
const now = new Date()
const moment = hours => new Date(now.getTime() + hours * 3_600_000).toISOString()
const due = days => new Date(now.getTime() + (days * 24 + 7) * 3_600_000).toISOString().slice(0, 10)
const command = (body, key = randomUUID()) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
})

export async function rehearseCommitmentDetection({ app, appFetch, cookies, admin, userId, foreignId, foreignToken, loopbackFetch, record, isolated }) {
  const output = isolated ? 'test-results/commitment-lifecycle/browser' : 'docs/phase-2/evidence/m3c'
  const primary = 'gửi biên bản kiểm tra lô linh kiện'
  const original = 'Chúng tôi cam kết sẽ ' + primary + ' trước ngày ' + due(2) + '.'
  const reschedule = 'Chúng tôi dời hạn sang ngày ' + due(4) + '.'
  const reassignment = 'Chúng tôi chuyển trách nhiệm cho verified@example.test.'
  const mail = (subject, body_text, hours, extra = {}) => ({
    id: randomUUID(), user_id: userId, from_address: 'supplier@example.test', from_name: 'Nhà cung cấp',
    subject, body_text, body_fetched: true, received_at: moment(hours), created_at: moment(hours),
    direction: 'inbound', is_read: true, provider_deleted: false, ...extra,
  })
  const old = mail('Xác nhận lịch giao [PO-731]', original, -9)
  const moved = mail('Đổi lịch giao [PO-731]', reschedule, -7)
  const outdated = mail('Lịch sử cũ [PO-731]', 'Chúng tôi dời hạn sang ngày ' + due(3) + '.', -12)
  const otherSender = mail('Đổi lịch bên ngoài [PO-731]', reschedule, -6, { from_address: 'other@example.test' })
  const otherMailbox = randomUUID()
  assert.equal((await admin.from('source_accounts').insert({
    id: otherMailbox, user_id: userId, email_address: 'secondary@example.test', provider: 'custom',
  })).error, null)
  const otherAccount = mail('Đổi lịch tại hộp thư khác [PO-731]', reschedule, -5, { source_account_id: otherMailbox })
  const quoted = mail('Chuyển tiếp [PO-731]', 'FYI\n> ' + original, -4)
  const deleted = mail('Thư đã xóa', original, -4, { provider_deleted: true })
  const foreign = mail('Thư của tenant khác', original, -4, { user_id: foreignId })
  const later = mail('Cam kết khác', 'We will send the updated inventory report.', -3)
  const priorPage = mail('Hồ sơ cũ', 'I will deliver the equipment register.', -96)
  const legacy = mail('Thư đã ghi thủ công', 'We will send the acceptance record.', -3)
  const neutral = Array.from({ length: 24 }, (_, index) => mail('Biên nhận ' + index, 'FYI, hệ thống đã nhận.', -28))
  async function insert(...rows) {
    assert.equal((await admin.from('emails').insert(rows)).error, null)
  }
  await insert(old, moved, outdated, otherSender, otherAccount, quoted, deleted, foreign, later, priorPage, legacy, ...neutral)

  async function read(path, init, status = 200) {
    const response = await appFetch(path, init)
    const payload = await response.json()
    assert.equal(response.status, status, JSON.stringify(payload))
    return payload
  }
  const initial = await read(endpoint)
  const initialOld = initial.proposals.find(p => p.emailId === old.id)
  const initialMove = initial.proposals.find(p => p.emailId === moved.id)
  assert.equal(initialOld.quote, original)
  record('recent mail yields exact cited proposals, with unresolved changes held until a target exists',
    initialOld.review.command.state.dueOn === due(2) && initialMove.blocked === 'unmatched' &&
      !initial.proposals.some(p => [quoted.id, deleted.id, foreign.id].includes(p.emailId)))
  record('detection and review reads do not create a ledger row', (await read(collection)).items.length === 0)
  const previous = await read(endpoint + '?beforeId=' + initial.nextBeforeId)
  record('older scan pages remain accessible without duplicate or foreign results',
    previous.proposals.some(p => p.emailId === priorPage.id) && previous.proposals.every(p => !initial.proposals.some(head => head.emailId === p.emailId)))

  const anon = await loopbackFetch(app + endpoint)
  const foreignRead = await loopbackFetch(app + endpoint + '?beforeId=' + old.id, { headers: { Authorization: 'Bearer ' + foreignToken } })
  const foreignWrite = command(initialOld.review.command)
  foreignWrite.headers.Authorization = 'Bearer ' + foreignToken
  const refused = await loopbackFetch(app + endpoint, foreignWrite)
  record('anonymous read and foreign cursor or confirmation are refused', anon.status === 401 && foreignRead.status === 404 && refused.status === 404)

  const laterDraft = initial.proposals.find(p => p.emailId === later.id).review.command
  assert.equal((await admin.from('emails').update({ body_text: later.body_text + '\nFYI only.' }).eq('id', later.id).eq('user_id', userId)).error, null)
  await read(endpoint, command(laterDraft), 409)
  record('changed source rejects confirmation even when the visible quote still exists', (await read(collection)).items.length === 0)
  await read(collection, command({
    referenceKey: 'manual:acceptance-record', state: initial.proposals.find(p => p.emailId === legacy.id).review.command.state,
    evidence: [{ emailId: legacy.id, field: 'body_text', quote: legacy.body_text }],
  }), 201)
  record('an email already used by the manual ledger is not proposed again',
    !(await read(endpoint)).proposals.some(p => p.emailId === legacy.id))

  mkdirSync(output, { recursive: true })
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const captures = []
  const runtimeErrors = []
  async function capture(page, name) {
    captures.push({ name, viewport: page.viewportSize(), axe: await audit(page) })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' })
  }
  let loseReply = false
  const keys = []
  try {
    for (const [name, viewport, touch] of [
      ['desktop', { width: 1440, height: 900 }, false],
      ['tablet', { width: 834, height: 1112 }, true],
      ['mobile', { width: 390, height: 844 }, true],
    ]) {
      const context = await browser.newContext({ locale: 'vi-VN', viewport, hasTouch: touch, isMobile: name === 'mobile', reducedMotion: 'reduce' })
      await context.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: app })))
      await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
      await context.route('**/*', async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.hostname !== '127.0.0.1') return route.abort()
        if (url.pathname === '/api/source-accounts/sync' || url.pathname === '/api/emails/send') return route.abort()
        if (url.pathname === '/api/ai/smart-reply') return route.fulfill({ json: { suggestions: [] } })
        if (url.pathname === endpoint && request.method() === 'POST') {
          keys.push(request.headers()['idempotency-key'])
          if (loseReply) {
            loseReply = false
            const reply = await route.fetch({ maxRetries: 0 })
            assert.equal(reply.status(), 200)
            return route.abort('failed')
          }
        }
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', error => runtimeErrors.push(error.message))
      page.on('console', message => {
        if (message.type() === 'error' && /hydration|hydrated|did not match/i.test(message.text())) runtimeErrors.push(message.text())
      })
      const reviewRow = heading => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
      const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
      const approve = dialog.getByRole('button', { name: 'Xác nhận và ghi vào sổ' })
      await page.goto(app + '/commitments', { waitUntil: 'domcontentloaded' })
      const nav = page.getByRole('link', { name: /Đề xuất từ email Có đề xuất cần duyệt/ })
      await nav.waitFor()
      await nav.click()
      await page.getByRole('heading', { name: 'Đề xuất từ email', exact: true }).waitFor()

      if (name === 'desktop') {
        await capture(page, 'desktop-proposals')
        const originalRow = reviewRow(primary)
        await originalRow.getByRole('link', { name: /Xác nhận lịch giao/ }).click()
        await page.waitForURL('**/inbox?email=' + old.id)
        await page.getByText('Xác nhận lịch giao [PO-731]', { exact: true }).first().waitFor()
        await page.goBack()
        await originalRow.getByRole('button', { name: 'Xem và xác nhận' }).click()
        await dialog.getByText(original, { exact: true }).waitFor()
        await dialog.getByText('supplier@example.test', { exact: false }).first().waitFor()
        await capture(page, 'desktop-preview')
        assert.equal((await read(collection)).items.length, 1)
        await approve.click()
        const receipt = page.getByText('Đã ghi vào sổ 1 đề xuất.')
        await receipt.waitFor()
        await page.waitForFunction(() => document.activeElement?.textContent === 'Đã ghi vào sổ 1 đề xuất.')
        record('source preview changes nothing until explicit confirmation and focus moves to the receipt', keys.length === 1)
        const listed = (await read(collection)).items.find(item => item.state.title === primary)
        const pending = await read(endpoint)
        const moves = pending.proposals.filter(p => [moved.id, outdated.id, otherSender.id, otherAccount.id].includes(p.emailId))
        assert.equal(moves.find(p => p.emailId === moved.id).review.command.id, listed.id)
        record('only the newer change with matching sender, mailbox and reference links to the same ledger',
          moves.find(p => p.emailId === outdated.id).blocked === 'chronology' &&
          [otherSender, otherAccount].every(mail => moves.find(p => p.emailId === mail.id).blocked === 'unmatched'))
      } else if (name === 'tablet') {
        await reviewRow(primary).getByRole('button', { name: 'Xem và xác nhận' }).waitFor()
        await capture(page, 'tablet-proposals')
      } else {
        await reviewRow(primary).getByRole('button', { name: 'Xem và xác nhận' }).click()
        await dialog.getByText('Trước đây', { exact: false }).first().waitFor()
        await dialog.getByText('Đề xuất', { exact: false }).first().waitFor()
        await capture(page, 'mobile-preview')
        loseReply = true
        await approve.click()
        await dialog.getByRole('button', { name: 'Thử lưu lại' }).click()
        await page.getByText('Đã ghi vào sổ 1 đề xuất.').waitFor()
        record('mobile approval previews old and new values and retries with the original idempotency key',
          keys.length === 3 && keys[1] === keys[2])
      }
      await context.close()
    }

    const listed = (await read(collection)).items.find(item => item.state.title === primary)
    assert.equal(listed.version, 2)
    assert.equal(listed.state.dueOn, due(4))
    let ledger = await read(collection + '/' + listed.id)
    record('accepted update keeps one identity and history links both original and changing emails',
      ledger.history.length === 2 && ledger.history[0].sources[0].emailId === moved.id &&
      ledger.history[1].sources[0].emailId === old.id)

    const reassign = mail('Đổi người phụ trách [PO-731]', reassignment, -2)
    const complete = mail('Xác nhận hoàn tất [PO-731]', 'Chúng tôi đã hoàn tất cam kết.', -1)
    await insert(reassign, complete)
    const beforeUpdate = (await read(endpoint)).proposals
    const changeOwner = beforeUpdate.find(p => p.emailId === reassign.id)
    const staleCompletion = beforeUpdate.find(p => p.emailId === complete.id)
    await read(endpoint, command({ ...changeOwner.review.command, referenceKey: 'mail:' + '0'.repeat(64) }), 404)
    const requests = await Promise.all([
      appFetch(endpoint, command(changeOwner.review.command)),
      appFetch(endpoint, command(changeOwner.review.command)),
    ])
    assert.deepEqual(requests.map(response => response.status).sort(), [200, 409])
    ledger = await read(collection + '/' + listed.id)
    record('concurrent approvals create a single version and persist only the explicit new assignee',
      ledger.version === 3 && ledger.state.ownerEmail === 'verified@example.test' && ledger.state.dueOn === due(4))

    await read(endpoint, command(staleCompletion.review.command), 409)
    record('confirmation from an older ledger version cannot overwrite the approved assignee',
      (await read(collection + '/' + listed.id)).version === 3)
    const newOwnerCompletion = mail('Hoàn tất ở hộp thư kỹ thuật [PO-731]', 'Tôi đã nộp biên bản và đã hoàn tất cam kết.', 0, {
      from_address: 'verified@example.test', source_account_id: otherMailbox,
    })
    await insert(newOwnerCompletion)
    const afterHandoff = (await read(endpoint)).proposals
    const finish = afterHandoff.find(p => p.emailId === newOwnerCompletion.id)
    assert.equal(afterHandoff.find(p => p.emailId === complete.id).blocked, 'unmatched')
    await read(endpoint, command({ ...finish.review.command, evidence: {
      ...finish.review.command.evidence, emailId: complete.id, quote: complete.body_text,
    }, sourceFingerprint: staleCompletion.review.command.sourceFingerprint }), 409)

    const two = mail('Hai đầu việc [QA-412]', 'Tôi sẽ gửi chứng thư.\nTôi sẽ nộp bảng đo.', 1)
    const ambiguous = mail('Đổi hạn [QA-412]', 'Chúng tôi dời hạn sang ngày ' + due(8) + '.', 2)
    await insert(two, ambiguous)
    const multi = await browser.newContext({ locale: 'vi-VN', viewport: { width: 390, height: 844 } })
    await multi.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: app })))
    await multi.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await multi.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.hostname !== '127.0.0.1' || url.pathname === '/api/source-accounts/sync') return route.abort()
      return route.continue()
    })
    const page = await multi.newPage()
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await page.goto(app + '/commitments')
    await page.getByRole('link', { name: /Đề xuất từ email Có đề xuất cần duyệt/ }).click()
    const row = title => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    const approve = async (title, quote, count) => {
      await row(title).getByRole('button', { name: 'Xem và xác nhận' }).click()
      await dialog.getByText(quote, { exact: true }).waitFor()
      await dialog.getByRole('button', { name: 'Xác nhận và ghi vào sổ' }).click()
      await page.getByText('Đã ghi vào sổ ' + count + ' đề xuất.').waitFor()
    }
    await approve(primary, newOwnerCompletion.body_text, 1)
    assert.equal(finish.review.command.id, listed.id)
    const closed = await read(collection + '?group=closed')
    const completed = await read(collection + '/' + listed.id)
    record('new owner can complete across mailboxes, former owner is blocked and the ledger retains all four sources',
      closed.items.some(item => item.id === listed.id && item.version === 4 && item.state.status === 'completed') &&
      completed.history.map(revision => revision.sources[0].emailId).join() === [newOwnerCompletion.id, reassign.id, moved.id, old.id].join())
    await approve('nộp bảng đo', 'Tôi sẽ nộp bảng đo.', 2)
    const partialPage = await read(endpoint)
    assert.equal(partialPage.proposals.find(p => p.emailId === ambiguous.id).blocked, 'ambiguous')
    await approve('gửi chứng thư', 'Tôi sẽ gửi chứng thư.', 3)
    const held = page.getByRole('listitem').filter({ hasText: ambiguous.body_text })
    await held.getByText('Có nhiều đầu việc có thể liên quan.', { exact: false }).waitFor()
    const finalPage = await read(endpoint)
    record('two quotes in the same message can be approved independently and a generic change stays blocked',
      !finalPage.proposals.some(p => p.emailId === two.id) &&
      finalPage.proposals.find(p => p.emailId === ambiguous.id).blocked === 'ambiguous' &&
      (await read(collection)).items.filter(item => ['gửi chứng thư', 'nộp bảng đo'].includes(item.state.title)).length === 2)
    await capture(page, 'mobile-lifecycle')
    await multi.close()

    const violationCount = captures.flatMap(entry => entry.axe).length
    assert.deepEqual(runtimeErrors, [])
    record('desktop, tablet and mobile proposals have no overflow, runtime exceptions or sampled axe violations', violationCount === 0)
    writeFileSync(output + '/browser.json', JSON.stringify({ engine: browser.version(), captures, runtimeErrors }, null, 2) + '\n')
  } finally {
    await browser.close()
  }
}
