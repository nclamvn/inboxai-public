import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const api = '/api/replies'
const syncPath = '/api/source-accounts/sync'
const json = { 'Content-Type': 'application/json' }
const vendor = 'vendor@example.test'
const replyTo = 'orders@example.test'
const subject = '[PO-8462] Xác nhận lịch giao bộ gá'
const sourceBody = 'Tôi sẽ gửi 200 bộ gá trước ngày 15/11/2026.'
const earlierBody = 'Bên tôi đã nhận yêu cầu giao bộ gá từ bộ phận mua hàng.'
const ownReply = 'Bên mua xác nhận đã nhận lịch giao. Nhờ anh báo lại nếu cần đổi ngày.'
const actualReply = 'Tôi dời hạn sang ngày 17/11/2026.'
const decoyReply = 'Lịch nội bộ trên tài khoản Kế toán.'
const parent = '<supplier-po-8462@example.test>'
const threadId = 'supplier-thread-8462'

export async function rehearseReplyWorkflow({ app, base, email, password, userId, admin, login, appFetch, sql, googleProvider,
  previousEmail, anon, anonymousClient, restartNext, smtpWire, record, output, conversation = false }) {
  const started = performance.now()
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  const accounts = []
  for (const address of ['ke-toan@example.test', 'mua-hang@example.test']) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    accounts.push({ id, address, ...fixture })
  }
  const [finance, buying] = accounts
  const initial = { id: 'source-po-8462', threadId, from: vendor, replyTo: 'Orders Desk <' + replyTo + '>',
    subject, messageId: parent, at: '2026-11-11T03:15:00Z', body: sourceBody }
  buying.deliver([
    { ...initial, id: 'early-po-8462', at: '2026-11-11T02:00:00Z', messageId: '<earlier@example.test>', body: earlierBody },
    initial,
  ])
  finance.deliver([{ ...initial, id: 'finance-po-8462', messageId: '<finance@example.test>', body: decoyReply }])
  const get = async (path, init) => {
    const response = await appFetch(path, init)
    const body = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(body)}`)
    return body
  }
  const post = (path, body, headers = {}) => get(path, {
    method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body),
  })
  const sync = () => post(syncPath, { refresh: true })
  await sync()
  const emailId = (account, uid) => sql(`SELECT id FROM public.emails WHERE user_id='${userId}'
    AND source_account_id='${account}' AND original_uid='${uid}'`).trim()
  async function syncUntil(account, uid) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await sync()
      const id = emailId(account, uid)
      if (id) return id
      await delay(400)
    }
    throw new Error('Could not sync synthetic source ' + uid)
  }
  const source = emailId(buying.id, initial.id)
  const financeSource = emailId(finance.id, 'finance-po-8462')
  const earlier = emailId(buying.id, 'early-po-8462')
  assert.ok(source && financeSource && earlier)
  const detection = (await get('/api/commitments/catchup')).proposals.find(proposal => proposal.emailId === source)
  assert.ok(detection?.review)
  const commitment = await post('/api/commitments/detections', detection.review.command, { 'Idempotency-Key': randomUUID() })
  const ledger = () => get('/api/commitments/' + commitment.id)
  const workbench = () => get(api + '?source=' + source)
  const queue = () => get(api)
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let page, phase
  const pageErrors = [], captures = []
  const stage = name => { phase = name; console.log('REPLY:', name) }
  const replyPane = () => page.getByRole('region', { name: 'Hồi đáp và bản nháp' })
  async function capture(name) {
    const violations = await audit(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.deepEqual({ violations, overflow }, { violations: [], overflow: false })
    captures.push({ name, viewport: page.viewportSize(), violations, overflow })
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled', fullPage: true })
  }
  async function newContext(viewport, storageState) {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', reducedMotion: 'reduce', viewport, storageState })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => [app, base].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
    return context
  }
  const thread = () => page.getByRole('region', { name: 'Hội thoại', exact: true })
  const readThread = id => get('/api/emails/' + id + '/conversation')
  const articleLink = (id, folder = 'inbox') => thread().locator(`a[href^="/${folder}?email=${id}&"]`)
  const currentMessage = () => thread().locator('[aria-current="true"]')
  async function openThread() {
    await thread().locator('summary').click()
    await thread().getByRole('list').waitFor()
  }
  const compose = app + '/compose?reply=' + source
  const countOperations = () => Number(sql(`SELECT count(*) FROM private.mail_send_operations WHERE user_id='${userId}'`))
  try {
    stage('đọc thư đúng tài khoản và lưu nháp trên desktop')
    const desktop = await newContext({ width: 1440, height: 900 })
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')
    await page.goto(app + '/inbox?email=' + source)
    if (conversation) {
      await openThread()
      assert.equal(await thread().getByRole('listitem').count(), 2)
      await thread().getByText(buying.address, { exact: true }).waitFor()
      await currentMessage().getByText('Đang xem', { exact: true }).waitFor()
      assert.deepEqual((await readThread(source)).messages.map(message => message.id), [earlier, source])
      assert.deepEqual((await readThread(financeSource)).messages.map(message => message.id), [financeSource])
      await capture('inbox-conversation-desktop')
      await articleLink(earlier).click()
      await page.waitForURL(url => url.searchParams.get('email') === earlier)
      await currentMessage().getByText('Đang xem', { exact: true }).waitFor()
      await page.getByRole('region', { name: 'Nội dung thư' }).getByText(earlierBody, { exact: true }).last().waitFor()
      await articleLink(source).click()
      await page.waitForURL(url => url.searchParams.get('email') === source)
      record('Inbox shows a chronological conversation without merging a matching subject and Gmail thread ID from the other account', true)
    }
    await page.getByRole('button', { name: 'Trả lời', exact: true }).click()
    await page.waitForURL(compose)
    const history = page.getByRole('region', { name: 'Hội thoại' })
    await history.getByText(earlierBody, { exact: true }).waitFor()
    await history.getByText(sourceBody, { exact: true }).waitFor()
    assert.deepEqual(await history.getByRole('listitem').count(), 2)
    assert.equal(await page.getByLabel('Người nhận').inputValue(), replyTo)
    await page.getByText(buying.address, { exact: false }).waitFor()
    assert.equal(new URL(page.url()).searchParams.size, 1)
    assert.equal((await workbench()).accountId, buying.id)
    record('thread shows only related mail in the receiving account and uses the parsed Reply-To address', true)
    await page.getByLabel('Cc', { exact: true }).fill(vendor)
    await page.getByLabel('Nội dung thư').fill(ownReply)
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click()
    await page.getByText('Bản nháp đã lưu', { exact: true }).waitFor()
    const saved = (await workbench()).draft
    assert.equal(saved.body, ownReply)
    const state = await desktop.storageState()
    await capture('desktop-draft')
    await desktop.close()

    stage('mở lại nháp trong phiên trình duyệt mobile mới')
    const mobile = await newContext({ width: 390, height: 844 }, state)
    if (conversation) {
      await page.goto(app + '/inbox?email=' + source)
      await openThread()
      await currentMessage().getByText('Đang xem', { exact: true }).waitFor()
      await articleLink(earlier).click()
      await page.waitForURL(url => url.searchParams.get('email') === earlier)
      await articleLink(source).waitFor()
      await page.getByText(earlierBody, { exact: true }).last().waitFor()
      await capture('inbox-conversation-mobile')
      record('The mobile reader opens the same conversation and keeps the selected message on navigation', true)
    }
    await page.goto(app + '/inbox')
    await replyPane().getByRole('link', { name: 'Mở bản nháp' }).click()
    await page.getByText('Bản nháp đã lưu', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Nội dung thư').inputValue(), ownReply)
    assert.equal(await page.getByLabel('Người nhận').inputValue(), replyTo)
    assert.equal(await page.getByLabel('Cc', { exact: true }).inputValue(), vendor)
    record('a new mobile browser session restores the server draft and addressing from Inbox', countOperations() === 0)
    await capture('mobile-recovered-draft')

    stage('đóng băng bản đã duyệt, ngắt kết nối sau khi Gmail giả lập nhận thư')
    await page.getByRole('button', { name: 'Xem trước thư gửi', exact: true }).click()
    const preview = page.getByRole('dialog', { name: 'Xem trước thư gửi' })
    await preview.getByText(ownReply, { exact: true }).waitFor()
    for (const address of [buying.address, replyTo, vendor]) await preview.getByText(address, { exact: true }).waitFor()
    assert.equal(countOperations(), 0)
    const wrongIdentity = await appFetch('/api/emails/send', { method: 'POST',
      headers: { ...json, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ sourceAccountId: finance.id, to: [replyTo], subject, text: ownReply, replyToEmailId: source }) })
    assert.equal(wrongIdentity.status, 409)
    assert.equal(countOperations(), 0)
    await capture('approved-preview')
    buying.box.dropSendAcknowledgement = true
    let lost
    await page.route(app + api, async route => {
      if (route.request().method() !== 'POST' || route.request().postDataJSON().action !== 'send') return route.continue()
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 })
      lost = await response.json()
      await mobile.setOffline(true)
      await route.abort('internetdisconnected')
    })
    await preview.getByRole('button', { name: 'Xác nhận gửi', exact: true }).click()
    await page.getByText('Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.', { exact: true }).waitFor()
    assert.equal(lost?.state, 'unknown')
    assert.equal(countOperations(), 1)
    const [sent] = googleProvider.calls.sent
    assert.deepEqual({ from: sent.from, to: sent.to, cc: sent.cc, threadId: sent.threadId, parent: sent.inReplyTo, body: sent.body },
      { from: buying.address, to: [replyTo], cc: [vendor], threadId, parent, body: ownReply })
    assert.equal(smtpWire.state.messages.length, 0)
    record('one loopback Gmail acceptance contains the approved account, recipients, exact reply header, thread and body despite lost acknowledgement',
      googleProvider.calls.sendAttempts === 1 && googleProvider.calls.sent.length === 1)
    await mobile.close()

    stage('khởi động lại ứng dụng, xác minh Sent và thử lặp')
    await restartNext()
    await newContext({ width: 820, height: 1180 }, state)
    await page.goto(compose)
    await page.getByText('Đang chờ xác minh', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Kiểm tra trạng thái gửi', exact: true }).click()
    await page.getByRole('button', { name: 'Theo dõi hồi đáp', exact: true }).waitFor()
    const recovered = (await workbench()).draft
    assert.equal(recovered.state, 'accepted')
    assert.equal(recovered.id, saved.id)
    const again = await Promise.all(['check', 'send', 'check'].map(action => post(api, { action, id: saved.id })))
    assert.ok(again.every(result => result.state === 'accepted' && result.operationId === lost.operationId))
    assert.equal(countOperations(), 1)
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.equal(Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}'
      AND direction='outbound' AND message_id='${sent.messageId}'`)), 1)
    record('restarted app verifies the same receipt from Gmail Sent and concurrent replays keep one dispatch and one Sent row', true)
    await page.getByRole('link', { name: 'Mở thư đã gửi', exact: true }).click()
    await page.waitForURL('**/inbox?email=' + recovered.sentId)
    await page.getByText(ownReply, { exact: true }).last().waitFor()
    assert.equal(await page.getByRole('button', { name: 'Trả lời', exact: true }).count(), 0)
    if (conversation) {
      assert.deepEqual((await readThread(recovered.sentId)).messages.map(message => message.id), [earlier, source, recovered.sentId])
      await page.goto(app + '/sent')
      await page.getByRole('button', { name: sent.subject, exact: true }).click()
      await page.waitForURL(url => url.pathname === '/sent' && url.searchParams.get('email') === recovered.sentId)
      await openThread()
      await thread().getByText('Thư đi', { exact: true }).waitFor()
      await thread().getByRole('link', { name: 'Trả lời hội thoại', exact: true }).waitFor()
      assert.equal(await thread().getByRole('link', { name: 'Trả lời hội thoại', exact: true }).getAttribute('href'), '/compose?reply=' + source)
      await capture('sent-conversation-before-sync')
      await articleLink(source, 'sent').click()
      await page.waitForURL(url => url.pathname === '/sent' && url.searchParams.get('email') === source)
      await currentMessage().getByText('Đang xem', { exact: true }).waitFor()
      await page.getByText(sourceBody, { exact: true }).last().waitFor()
      record('Sent opens the same inbound and outbound history before Gmail history sync and replies from the correct inbound account', true)
    }
    await page.goto(compose)
    await page.getByRole('button', { name: 'Theo dõi hồi đáp', exact: true }).click()
    await page.getByText('Đang theo dõi hồi đáp', { exact: true }).waitFor()
    await page.goto(app + '/inbox')
    await replyPane().getByText('Đang chờ', { exact: true }).waitFor()
    await capture('waiting-after-recovery')

    stage('nạp thư trùng tiêu đề và một hồi đáp có chứng cứ')
    const incomingAt = new Date().toISOString()
    finance.deliver([{ ...initial, id: 'wrong-account', subject: sent.subject, inReplyTo: sent.messageId,
      messageId: '<wrong-account@example.test>', at: incomingAt, body: 'Thư trùng trên tài khoản khác.' }])
    buying.deliver([
      { ...initial, id: 'same-subject', threadId: 'other-work', subject: sent.subject, messageId: '<same-subject@example.test>',
        at: incomingAt, body: 'Thư cùng tiêu đề nhưng thuộc công việc khác.' },
      { ...initial, id: 'wrong-sender', threadId: 'other-work', subject: sent.subject, inReplyTo: sent.messageId,
        from: 'stranger@example.test', messageId: '<wrong-sender@example.test>',
        at: incomingAt, body: 'Thư có mã tham chiếu nhưng người gửi không nằm trong lượt gửi.' },
    ])
    await syncUntil(finance.id, 'wrong-account')
    await syncUntil(buying.id, 'same-subject')
    await syncUntil(buying.id, 'wrong-sender')
    assert.equal((await queue())[0].status, 'waiting')
    await page.reload()
    await replyPane().getByText('Đang chờ', { exact: true }).waitFor()
    buying.deliver([{ ...initial, id: 'actual-reply', subject: sent.subject, inReplyTo: sent.messageId,
      messageId: '<actual-reply@example.test>', at: new Date().toISOString(), body: actualReply }])
    const actual = await syncUntil(buying.id, 'actual-reply')
    const match = (await queue())[0]
    assert.equal(match?.replyId, actual, JSON.stringify({ match, headers: sql(`SELECT from_address,thread_id,in_reply_to,reply_references
      FROM public.emails WHERE id='${actual}'`), wireMessageId: sent.messageId }))
    await page.reload()
    await replyPane().getByText('Có hồi đáp', { exact: true }).waitFor()
    await replyPane().getByText(actualReply, { exact: true }).waitFor()
    assert.equal((await get(api + '?account=' + finance.id)).length, 0)
    await capture('action-inbox-reply')
    await replyPane().getByRole('link', { name: 'Mở thư hồi đáp', exact: true }).click()
    await page.waitForURL('**/inbox?email=' + actual)
    await page.getByText(actualReply, { exact: true }).last().waitFor()
    assert.equal((await ledger()).version, 1)
    const update = (await get('/api/commitments/catchup?source=' + actual)).proposals[0]
    assert.ok(update?.review)
    await page.goto(app + '/commitments?view=catchup&source=' + actual)
    if (conversation) {
      const proposal = page.getByRole('heading', { name: 'Việc chờ xử lý' })
      await proposal.waitFor()
      await page.locator(`a[href="/inbox?email=${actual}"]`).getByText(/Mở email nguồn/).click()
      await page.waitForURL('**/inbox?email=' + actual)
      await page.getByText(actualReply, { exact: true }).last().waitFor()
      await openThread()
      assert.deepEqual((await readThread(actual)).messages.map(message => message.id), [earlier, source, recovered.sentId, actual])
      await currentMessage().getByText('Đang xem', { exact: true }).waitFor()
      assert.equal(await thread().getByText(decoyReply, { exact: true }).count(), 0)
      assert.equal(await thread().getByText('Thư có mã tham chiếu nhưng người gửi không nằm trong lượt gửi.', { exact: true }).count(), 0)
      assert.equal(googleProvider.calls.sendAttempts, 1)
      await capture('commitment-exact-source-conversation')
      await page.goto(app + '/commitments?view=catchup&source=' + actual)
      record('Commitment opens the exact reply, and replayed Gmail sync keeps one outgoing message while excluding a conflicting thread reference', true)
    }
    await page.getByRole('button', { name: 'Xem và xác nhận' }).click()
    const confirm = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    await confirm.getByText(actualReply, { exact: true }).waitFor()
    await confirm.getByRole('button', { name: 'Xác nhận và ghi vào sổ' }).click()
    await page.getByText(/Đã ghi vào sổ 1 đề xuất/).waitFor()
    const updated = await ledger()
    assert.equal(updated.version, 2)
    assert.equal(updated.state.dueOn, '2026-11-17')
    if (conversation) {
      await page.goto(app + '/commitments?group=waiting&id=' + commitment.id)
      await page.locator(`a[href="/inbox?email=${source}"]`).first().click()
      await page.waitForURL('**/inbox?email=' + source)
      await page.getByText(sourceBody, { exact: true }).last().waitFor()
      await openThread()
      await currentMessage().getByText('Đang xem', { exact: true }).waitFor()
      await articleLink(actual).waitFor()
      record('The commitment ledger opens the older original source without switching to the newest reply', true)
    }
    record('only the cited reply in the tracked account appears in Action Inbox and the commitment changes only after explicit confirmation', true)

    stage('kiểm tra phiên bản bản nháp và phân quyền')
    const foreign = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    assert.equal((await foreign.auth.signInWithPassword({ email: previousEmail, password })).error, null)
    assert.ok((await foreign.rpc('read_reply_workbench', { p_source: source })).error)
    assert.ok((await foreign.rpc('change_reply_draft', { p_id: saved.id, p_action: 'stop' })).error)
    assert.ok((await anonymousClient.rpc('list_reply_work', { p_accounts: [] })).error)
    if (conversation) {
      assert.equal((await foreign.rpc('read_email_conversation', { p_email_id: source })).error?.code, 'PT404')
      assert.ok((await anonymousClient.rpc('read_email_conversation', { p_email_id: source })).error)
      assert.equal((await appFetch('/api/emails/' + source + '/conversation?beforeId=' + source)).status, 400)
      const earlierBatch = Array.from({ length: 22 }, (_, index) => ({ ...initial, id: 'conversation-history-' + index,
        at: new Date(Date.parse(initial.at) - (30 + index) * 86_400_000).toISOString(),
        messageId: '<conversation-history-' + index + '@example.test>', body: 'Tài liệu trước đó số ' + index }))
      buying.deliver(earlierBatch)
      await syncUntil(buying.id, earlierBatch.at(-1).id)
      const recent = await readThread(source)
      assert.equal(recent.messages.length, 20)
      assert.ok(recent.older)
      await page.goto(app + '/inbox?email=' + source)
      await openThread()
      await thread().getByRole('button', { name: 'Xem thư cũ hơn' }).click()
      await thread().getByRole('button', { name: 'Xem thư cũ hơn' }).waitFor({ state: 'hidden' })
      assert.equal(await thread().getByRole('listitem').count(), 26)
      const oldest = emailId(buying.id, earlierBatch.at(-1).id)
      const pinned = await readThread(oldest)
      assert.equal(pinned.messages.length, 21)
      assert.equal(pinned.messages[0].id, oldest)
      assert.deepEqual(pinned.older, recent.older)
      assert.equal(googleProvider.calls.sendAttempts, 1)
      record('Conversation pagination retains an older selected message, loads the remaining history once, and rejects foreign and anonymous readers', true)
    }

    assert.ok((await login.rpc('read_reply_approval', { p_actor: userId, p_id: saved.id })).error)
    assert.ok((await login.rpc('begin_reply_send', { p_user_id: userId, p_account_id: buying.id, p_draft: saved.id,
      p_key: randomUUID(), p_hash: 'a'.repeat(64), p_payload: {} })).error)
    await page.goto(app + '/inbox')
    await replyPane().getByRole('button', { name: 'Đã xử lý hồi đáp', exact: true }).click()
    await replyPane().waitFor({ state: 'hidden' })
    await page.reload()
    assert.deepEqual(await queue(), [])
    assert.equal(countOperations(), 1)
    assert.deepEqual(pageErrors, [])
    const decoy = emailId(buying.id, 'same-subject')
    const context = await get(api + '?source=' + decoy)
    const secondDraft = { action: 'save', source: decoy, id: null, revision: null,
      fingerprint: context.fingerprint, to: vendor, cc: '', body: 'Đang soạn phản hồi thứ hai.' }
    const firstSave = await post(api, secondDraft)
    const revisions = await Promise.all(['Bản nháp từ tab A.', 'Bản nháp từ tab B.'].map(body => appFetch(api, {
      method: 'POST', headers: json, body: JSON.stringify({ ...secondDraft, id: firstSave.id, revision: firstSave.revision, body }),
    })))
    assert.deepEqual(revisions.map(response => response.status).sort(), [200, 409])
    const latestDraft = (await get(api + '?source=' + decoy)).draft
    await post(api, { action: 'prepare', source: decoy, id: latestDraft.id, revision: latestDraft.revision })
    const checkOnly = await appFetch(api, { method: 'POST', headers: json, body: JSON.stringify({ action: 'check', id: latestDraft.id }) })
    assert.equal(checkOnly.status, 409)
    buying.deliver([{ ...initial, id: 'same-subject', threadId: 'other-work', subject: sent.subject,
      messageId: '<same-subject@example.test>', at: incomingAt, body: 'Nguồn đã đổi sau khi xem trước.' }])
    let changedContext
    for (let attempt = 0; attempt < 10; attempt++) {
      await sync()
      changedContext = await get(api + '?source=' + decoy)
      if (changedContext.stale) break
      await delay(400)
    }
    assert.equal(changedContext?.stale, true)
    const refused = await appFetch(api, { method: 'POST', headers: json, body: JSON.stringify({ action: 'send', id: latestDraft.id }) })
    assert.equal(refused.status, 409)
    assert.equal(countOperations(), 1)
    await post(api, { action: 'edit', id: latestDraft.id, fingerprint: changedContext.fingerprint })
    await post(api, { action: 'discard', id: latestDraft.id })
    assert.deepEqual(await queue(), [])
    record('concurrent draft edits detect conflict and status checks or changed evidence cannot claim a new dispatch', true)
    record('foreign and anonymous access is blocked, and acknowledgement persists without a second outbound send', true)
    record('Chrome captures on desktop, tablet and mobile have no sampled axe violations, page errors or horizontal overflow', true)
    writeFileSync(output + '/workflow.json', JSON.stringify({
      accounts: accounts.length, resumedDrafts: 1, browserNetworkDrops: 1, providerAcknowledgementDrops: 1,
      acceptedDispatches: googleProvider.calls.sent.length, sendAttempts: googleProvider.calls.sendAttempts,
      sentRows: 1, observedTrackedReplies: 1, ignoredDecoys: 3, approvedCommitmentVersions: [1, 2],
      elapsedMs: Math.round(performance.now() - started), captures,
    }, null, 2) + '\n')
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {})
    throw new Error(phase + ' · ' + error.message, { cause: error })
  } finally {
    await browser.close()
  }
}
