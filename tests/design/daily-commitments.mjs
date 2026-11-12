import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { audit } from './browser.mjs'
import { dailyCommitmentFixture } from './daily-commitment-fixture.mjs'

const attentionPath = '/api/commitments/attention'
const detectionPath = '/api/commitments/detections'
const json = { 'Content-Type': 'application/json' }

export async function rehearseDailyCommitments({
  app, base, email, previousEmail, password, userId, admin, appFetch, fixture, loopbackFetch, smtpWire, mailpit, record, output,
}) {
  const corpus = dailyCommitmentFixture(email)
  const accounts = { work: fixture.work, finance: fixture.accounting.source_account_id }
  const messages = new Map()
  await admin.from('emails').delete().eq('user_id', userId)
    .in('id', [fixture.original.id, fixture.moved.id, fixture.accounting.id])
    .throwOnError()
  await admin.from('emails').delete().eq('user_id', userId).eq('from_address', 'newsletter@example.test').throwOnError()

  async function add(sample) {
    const id = randomUUID()
    const row = {
      id, user_id: userId, source_account_id: accounts[sample.account], from_address: sample.sender,
      message_id: '<' + id + '@fixture.example.test>', subject: sample.subject, body_text: sample.body, snippet: sample.body,
      received_at: sample.at, created_at: sample.at, direction: 'inbound', body_fetched: true,
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

  for (const sample of corpus.initial) await add(sample)
  const main = await confirmSetup('a1')
  const own = await confirmSetup('b1')
  await confirmSetup('c1')
  await confirmSetup('d1')
  await confirmSetup('d2')

  const source = messages.get('a1')
  const readPath = '/api/commitments/' + main.id
  const reminderPath = readPath + '/reminder'
  const expectedSubject = 'Re: ' + source.subject
  const startedWith = smtpWire.state.messages.length
  const opened = new Set()
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const captured = []
  const runtimeErrors = []
  let phase = 'đăng nhập'
  mkdirSync(output, { recursive: true })
  async function session(address, options, controlClock = false) {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', reducedMotion: 'reduce', ...options })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (url.pathname === '/api/source-accounts/sync') return route.fulfill({ json: { results: [] } })
      return route.continue()
    })
    const page = await context.newPage()
    if (controlClock) await page.clock.install()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(address)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')
    return page
  }
  async function capture(page, name) {
    const violations = await audit(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.deepEqual({ violations, overflow }, { violations: [], overflow: false })
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' })
    captured.push({ name, viewport: page.viewportSize(), violations, overflow })
  }
  const metrics = {}
  let page
  try {
    page = await session(email, { viewport: { width: 1440, height: 900 } }, true)
    const attention = () => page.getByRole('region', { name: 'Cam kết cần chú ý' })
    const row = () => attention().getByRole('listitem').filter({ hasText: corpus.title })
    const openInbox = async () => { await page.goto(app + '/inbox'); await attention().waitFor() }
    const started = performance.now()
    phase = 'ưu tiên dựa trên hạn và email nguồn'
    await row().getByText(/Quá hạn/).waitFor()
    const initial = (await appJson(attentionPath)).items
    assert.deepEqual(initial.map(item => [item.id,item.reason,item.responsibility]), [
      [main.id, 'overdue', 'waiting'], [own.id, 'today', 'mine'],
    ])
    assert.deepEqual((await appJson(attentionPath + '?account=' + accounts.finance)).items, [])
    assert.equal(await attention().getByRole('button', { name: 'Xem trước lời nhắc' }).count(), 1)
    assert.equal(initial[0].source.quote, source.body_text)
    await capture(page, 'inbox-desktop')
    await row().getByRole('link', { name: 'Mở email nguồn' }).click()
    await page.waitForURL('**/inbox?email=' + source.id)
    await page.getByText(source.body_text, { exact: true }).first().waitFor()
    opened.add('a1')
    await openInbox()
    await row().getByRole('link', { name: 'Xem lịch sử' }).click()
    await page.getByRole('heading', { name: 'Lịch sử', exact: true }).waitFor()
    await page.getByRole('link', { name: source.subject, exact: true }).waitFor()
    await openInbox()
    metrics.initialMs = performance.now() - started
    record('daily inbox ranks the cited overdue commitment ahead of today, respects account scope, and opens source and ledger history', true)

    phase = 'xem trước và phê duyệt lời nhắc'
    const preview = page.getByRole('dialog', { name: 'Xem trước lời nhắc' })
    const approve = () => preview.getByRole('button', { name: 'Xác nhận và gửi lời nhắc' })
    const viewReminder = async () => {
      await row().getByRole('button', { name: 'Xem trước lời nhắc' }).click()
      await approve().waitFor()
    }
    await viewReminder()
    await preview.getByText(corpus.vendor, { exact: true }).waitFor()
    await preview.getByText(expectedSubject, { exact: true }).waitFor()
    assert.equal(smtpWire.state.messages.length, startedWith)
    const draft = await appJson(reminderPath)
    const command = { accountId: draft.accountId, proof: draft.proof, version: draft.version }
    const forged = await admin.rpc('begin_commitment_reminder', {
      p_user_id: userId, p_account_id: draft.accountId, p_commitment_id: main.id, p_version: draft.version, p_proof: draft.proof,
      p_payload: { from: { address: draft.fromAddress, name: draft.fromName }, to: ['attacker@example.test'],
        cc: [], bcc: [], subject: draft.subject, text: draft.text, inReplyTo: source.message_id },
    })
    assert.equal(forged.error?.code, 'PT409')
    await admin.from('emails').update({ body_text: source.body_text + '\nGhi chú kho.' }).eq('id', source.id).eq('user_id', userId).throwOnError()
    const stale = page.waitForResponse(response => response.url() === app + reminderPath && response.request().method() === 'POST')
    await approve().click()
    assert.equal((await stale).status(), 409)
    assert.equal(smtpWire.state.messages.length, startedWith)
    await admin.from('emails').update({ body_text: source.body_text }).eq('id', source.id).eq('user_id', userId).throwOnError()
    await preview.getByRole('button', { name: 'Đóng', exact: true }).click()
    await viewReminder()
    record('preview is read-only and a forged recipient or changed source cannot reserve a send', true)

    let committed
    let concurrentReceipt
    await page.route(app + reminderPath, async route => {
      if (route.request().method() !== 'POST' || committed) return route.continue()
      const [actual, competing] = await Promise.all([
        route.fetch({ maxRetries: 0, maxRedirects: 0 }),
        page.request.post(app + reminderPath, { data: command }),
      ])
      const browserReceipt = await actual.json()
      concurrentReceipt = await competing.json()
      committed = [browserReceipt, concurrentReceipt].find(receipt => receipt.state === 'accepted')
      if (!committed || !actual.ok() || !competing.ok()) return route.fulfill({ response: actual })
      return route.abort('failed')
    })
    const reminderStart = performance.now()
    await approve().click()
    const check = preview.getByRole('button', { name: 'Kiểm tra kết quả gửi' })
    await check.waitFor()
    assert.equal(committed.state, 'accepted')
    assert.equal(concurrentReceipt.operationId, committed.operationId)
    const replayResponse = page.waitForResponse(response => response.url() === app + reminderPath && response.request().method() === 'POST')
    await check.click()
    const replay = await (await replayResponse).json()
    assert.equal(replay.operationId, committed.operationId)
    await preview.getByText('Đã gửi lời nhắc', { exact: true }).waitFor()
    await capture(page, 'reminder-desktop')
    await preview.getByRole('button', { name: 'Đóng', exact: true }).click()
    await row().getByText('Đã gửi lời nhắc', { exact: true }).waitFor()
    await page.reload()
    await row().getByText('Đã gửi lời nhắc', { exact: true }).waitFor()
    assert.equal(smtpWire.state.messages.length, startedWith + 1)
    const inbox = await (await loopbackFetch(mailpit + '/api/v1/messages')).json()
    const matching = inbox.messages.filter(message => message.Subject === expectedSubject)
    assert.equal(matching.length, 1)
    assert.deepEqual(matching[0].To.map(recipient => recipient.Address), [corpus.vendor])
    const content = await (await loopbackFetch(mailpit + '/api/v1/message/' + matching[0].ID)).json()
    assert.ok(content.Text.includes(corpus.title))
    assert.ok(content.Text.includes(corpus.oldDue.split('-').reverse().join('/')))
    metrics.reminderMs = performance.now() - reminderStart
    record('one reminder reaches Mailpit under concurrent approvals, lost acknowledgement and retry after reload', true)

    phase = 'phản hồi mơ hồ'
    const unclear = await add(corpus.replies[0])
    const unclearStart = performance.now()
    await page.clock.fastForward(61_000)
    await row().getByText(unclear.body_text, { exact: true }).waitFor()
    await row().getByRole('link', { name: 'Kiểm tra phản hồi' }).click()
    await page.getByText('Người phụ trách chưa xác nhận lịch. Cam kết giữ nguyên hạn đã duyệt.').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Xem và xác nhận', exact: true }).count(), 0)
    const afterUnclear = await appJson(readPath)
    assert.equal(afterUnclear.version, 1)
    assert.equal(afterUnclear.state.dueOn, corpus.oldDue)
    await page.getByRole('link', { name: /Đang chờ xe/ }).click()
    await page.waitForURL('**/inbox?email=' + unclear.id)
    opened.add('a2')
    metrics.unclearMs = performance.now() - unclearStart
    record('polling surfaces an ambiguous reply with exact evidence and leaves the approved deadline unchanged', true)

    const newVersion = async (sample, expectedVersion) => {
      const message = await add(sample)
      await openInbox()
      await row().getByText(message.body_text, { exact: true }).waitFor()
      await row().getByRole('link', { name: 'Xem đề xuất cập nhật' }).click()
      await page.getByRole('button', { name: 'Xem và xác nhận', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
      await dialog.getByText(message.body_text, { exact: true }).waitFor()
      assert.equal((await appJson(readPath)).version, expectedVersion - 1)
      await dialog.getByRole('button', { name: 'Xác nhận và ghi vào sổ' }).click()
      await page.getByText('Đã ghi vào sổ 1 đề xuất.', { exact: true }).waitFor()
      return message
    }

    phase = 'xác nhận đổi hạn'
    const changeStart = performance.now()
    const moved = await newVersion(corpus.replies[1], 2)
    const updated = await appJson(readPath)
    assert.equal(updated.state.dueOn, corpus.newDue)
    assert.equal(updated.history[0].sources[0].emailId, moved.id)
    await openInbox()
    assert.equal(await row().count(), 0)
    metrics.changeMs = performance.now() - changeStart
    record('a confirmed later date updates the original commitment and removes the overdue item', true)

    phase = 'khép và mở email nguồn'
    const closeStart = performance.now()
    const closed = await newVersion(corpus.replies[2], 3)
    const latest = await appJson(readPath)
    assert.equal(latest.state.status, 'completed')
    assert.deepEqual(latest.history.map(revision => revision.sources[0].emailId), [closed.id,moved.id,source.id])
    await openInbox()
    assert.equal(await row().count(), 0)
    await page.goto(app + '/commitments?group=closed&id=' + main.id)
    await page.getByRole('link', { name: closed.subject, exact: true }).click()
    await page.waitForURL('**/inbox?email=' + closed.id)
    await page.getByText(closed.body_text, { exact: true }).first().waitFor()
    opened.add('a4')
    metrics.closeMs = performance.now() - closeStart
    const oldReceipt = await appJson(reminderPath, { method: 'POST', headers: json, body: JSON.stringify(command) })
    assert.equal(oldReceipt.operationId, committed.operationId)
    assert.equal(smtpWire.state.messages.length, startedWith + 1)
    record('completion closes the same item, preserves all approved sources and never re-sends an older approved reminder', true)

    phase = 'bàn phím, mobile và tablet'
    for (const [name, viewport] of [['tablet',{ width: 834, height: 1112 }],['mobile',{ width: 390, height: 844 }]]) {
      page = await session(email, { viewport, hasTouch: true, isMobile: name === 'mobile' })
      const history = attention().getByRole('link', { name: 'Xem lịch sử' })
      await history.waitFor()
      await capture(page, 'inbox-' + name)
      await history.focus()
      await page.keyboard.press('Enter')
      await page.waitForURL('**/commitments?group=mine&id=' + own.id)
    }
    record('tablet and mobile attention are keyboard navigable and have no overflow or sampled axe violations', true)

    phase = 'cách ly tài khoản'
    const foreign = await session(previousEmail, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const foreignItems = await foreign.request.get(app + attentionPath)
    assert.deepEqual((await foreignItems.json()).items, [])
    assert.equal((await foreign.request.get(app + reminderPath)).status(), 404)
    assert.equal((await foreign.request.post(app + reminderPath, { data: command })).status(), 404)
    assert.equal((await loopbackFetch(app + reminderPath)).status, 401)
    assert.equal(smtpWire.state.messages.length, startedWith + 1)
    record('another tenant and an anonymous caller cannot read or send the buyer’s reminder', true)

    phase = 'đối chứng mô phỏng đọc thư'
    const manual = await session(email, { viewport: { width: 1440, height: 900 } })
    const manualStart = performance.now()
    const inspected = []
    for (const sample of [...corpus.initial, ...corpus.replies]) {
      const message = messages.get(sample.id)
      await manual.goto(app + '/inbox?email=' + message.id)
      await manual.getByText(sample.body.split('\n')[0], { exact: false }).first().waitFor()
      inspected.push(sample.id)
    }
    const manualMs = performance.now() - manualStart
    assert.deepEqual(runtimeErrors, [])
    writeFileSync(output + '/workflow.json', JSON.stringify({
      corpus, captured, product: { openedEmails: [...opened], metrics, exactActions: 5, corrections: 0, importantMisses: 0 },
      manual: { openedEmails: inspected, elapsedMs: manualMs,
        evidence: 'Scripted review of known messages in the regular Inbox. No human timing.' },
      smtpDeliveries: 1, revisionCount: latest.version,
    }, null, 2) + '\n')
  } catch (error) {
    if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw new Error('Daily commitment workflow failed at ' + phase, { cause: error })
  } finally {
    await browser.close()
  }
}
