import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const api = '/api/replies'
const json = { 'Content-Type': 'application/json' }
const dayMs = 86_400_000
const vietnamOffset = 7 * 3_600_000
const start = Date.parse(new Date(Date.now() + vietnamOffset - 7 * dayMs).toISOString().slice(0, 10)) - vietnamOffset
const day = offset => new Date(start + offset * dayMs + vietnamOffset).toISOString().slice(0, 10)

export async function rehearseReplyFollowup({ app, base, email, password, userId, admin, appFetch, sql,
  googleProvider, previousEmail, anon, login, restartNext, smtpWire, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address, true)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const buying = await mailbox('mua-hang@example.test')
  const finance = await mailbox('ke-toan@example.test')
  const conversations = [
    { name: 'Xác nhận mẫu vật tư', code: 'mau', vendor: 'vattu@example.test', account: buying },
    { name: 'Đối chiếu hóa đơn tháng', code: 'hoadon', vendor: 'hoadon@example.test', account: finance },
    { name: 'Lịch giao linh kiện', code: 'lich', vendor: 'lichgiao@example.test', account: buying },
  ]
  const [answered, moved, reminder] = conversations

  function incoming(conversation, suffix, body, inReplyTo, at = start) {
    const message = { id: conversation.code + '-' + suffix, threadId: conversation.code + '-thread',
      from: conversation.vendor, subject: inReplyTo ? 'Re: ' + conversation.name : conversation.name,
      messageId: '<' + conversation.code + '-' + suffix + '@example.test>', inReplyTo, body, at: new Date(at).toISOString() }
    conversation.account.deliver([message])
    return message
  }

  async function request(path, init) {
    const response = await appFetch(path, init)
    const data = await response.json()
    assert.ok(response.ok, `${path} ${response.status} ${JSON.stringify(data)}`)
    return data
  }
  const post = (path, body) => request(path, { method: 'POST', headers: json, body: JSON.stringify(body) })
  const act = body => post(api, body)
  const sync = () => post('/api/source-accounts/sync', { refresh: true })
  const queue = async item => (await request(api)).find(row => row.id === item.id)
  const countReminders = () => Number(sql(`SELECT count(*) FROM private.mail_send_operations
    WHERE user_id='${userId}' AND reply_followup_draft IS NOT NULL`))
  const clockAt = async (page, when) => {
    const time = new Date(when)
    // Replace the private clock in this disposable database. No test-time HTTP override is shipped.
    sql(`CREATE OR REPLACE FUNCTION private.reply_followup_today() RETURNS date LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT (TIMESTAMPTZ '${time.toISOString()}' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date $$;`)
    await page.clock.setFixedTime(time)
  }
  for (const item of conversations) incoming(item, 'nguon', 'Anh/chị kiểm tra giúp tôi thông tin này.')
  await sync()
  for (const item of conversations) {
    item.source = sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${item.account.id}'
      AND original_uid='${item.code}-nguon'`).trim()
    assert.ok(item.source)
    const workbench = await request(api + '?source=' + item.source)
    const draft = await act({ action: 'save', source: item.source, id: null, revision: null,
      fingerprint: workbench.fingerprint, to: item.vendor, cc: '', body: 'Nhờ anh/chị xác nhận thông tin đã trao đổi.' })
    item.id = draft.id
    await act({ action: 'prepare', source: item.source, id: item.id, revision: draft.revision })
    const sent = await act({ action: 'send', id: item.id })
    assert.equal(sent.state, 'accepted')
    item.original = sent.messageId
  }
  assert.equal(googleProvider.calls.sendAttempts, 3)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let context, page
  const pageErrors = []
  async function open(viewport, storageState) {
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport,
      serviceWorkers: 'block', reducedMotion: 'reduce', storageState })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      // Mail advances only at the scenario's explicit sync steps and at actual approval.
      if (url.pathname === '/api/source-accounts/sync') return route.fulfill({ json: { synced: 0 } })
      return [app, base].includes(url.origin) ? route.continue() : route.abort()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  const pane = () => page.getByRole('region', { name: 'Hồi đáp và bản nháp' })
  const due = () => pane().getByRole('region', { name: 'Cần theo dõi hôm nay' })
  const row = item => pane().getByRole('listitem').filter({ hasText: item.name })
  const dateLabel = 'Ngày kiểm tra lại (giờ Việt Nam)'
  const goInbox = () => page.goto(app + '/inbox')
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
  }
  async function preview(item) {
    await row(item).getByRole('button', { name: 'Xem trước thư nhắc' }).click()
    const dialog = page.getByRole('dialog', { name: 'Xem trước thư nhắc' })
    await dialog.getByRole('button', { name: 'Xác nhận gửi thư nhắc' }).waitFor()
    assert.equal(await dialog.getByText(item.account.address, { exact: true }).count(), 1)
    assert.equal(await dialog.getByText(item.vendor, { exact: true }).count(), 1)
    return dialog
  }

  try {
    await open({ width: 1440, height: 900 })
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')
    await clockAt(page, start)
    for (const item of conversations) {
      await page.goto(app + '/compose?reply=' + item.source)
      await page.getByLabel(dateLabel).fill(day(2))
      await page.getByRole('button', { name: 'Theo dõi hồi đáp', exact: true }).click()
      await page.getByText('Đang theo dõi hồi đáp', { exact: true }).waitFor()
      assert.equal((await queue(item)).followupOn, day(2))
    }
    await goInbox()
    await row(moved).getByText(/Đang chờ/).waitFor()
    const old = await queue(moved)
    await row(moved).getByRole('button', { name: 'Dời hẹn' }).click()
    const dateDialog = page.getByRole('dialog', { name: 'Ngày kiểm tra lại' })
    assert.equal(await dateDialog.getByLabel(dateLabel).inputValue(), day(2))
    await dateDialog.getByLabel(dateLabel).fill(day(4))
    await dateDialog.getByRole('button', { name: 'Lưu ngày kiểm tra' }).click()
    await dateDialog.waitFor({ state: 'hidden' })
    const saved = await queue(moved)
    assert.equal(saved.followupOn, day(4))
    assert.notEqual(saved.followupKey, old.followupKey)
    const staleDate = await appFetch(api, { method: 'POST', headers: json, body: JSON.stringify({
      action: 'schedule-followup', id: moved.id, on: day(3), expected: old.followupKey,
    }) })
    assert.equal(staleDate.status, 409)
    record('three schedules saved through Compose and the moved appointment rejects a stale edit', countReminders() === 0)

    incoming(answered, 'dap', 'Đã xác nhận mẫu vật tư.', answered.original, start + dayMs)
    await sync()
    const storage = await context.storageState()
    await context.close()
    await restartNext()
    await open({ width: 1280, height: 900 }, storage)
    await clockAt(page, start + 2 * dayMs - 1000)
    await goInbox()
    await row(answered).getByText(/Có hồi đáp/).waitFor()
    await row(reminder).getByText(/Đang chờ/).waitFor()
    assert.equal(await due().count(), 0)

    await clockAt(page, start + 2 * dayMs)
    await page.reload()
    await due().getByText(reminder.name, { exact: false }).waitFor()
    assert.equal(await due().getByRole('listitem').count(), 1)
    await row(moved).getByText(/Đang chờ/).waitFor()
    await row(answered).getByRole('link', { name: 'Mở thư hồi đáp' }).waitFor()
    await capture('due-at-vietnam-midnight')
    record('Vietnam midnight surfaces only the due conversation after restart and keeps the rescheduled item waiting', countReminders() === 0)

    const dialog = await preview(reminder)
    await capture('approved-preview')
    reminder.account.box.dropSendAcknowledgement = true
    let approval, lost
    await page.route(app + api, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const command = route.request().postDataJSON()
      if (command.action !== 'send-followup') return route.continue()
      approval = command
      const result = await route.fetch({ maxRetries: 0, maxRedirects: 0 })
      lost = await result.json()
      await context.setOffline(true)
      await route.abort('internetdisconnected')
    })
    await dialog.getByRole('button', { name: 'Xác nhận gửi thư nhắc' }).click()
    await page.getByText('Mất kết nối. Hãy kiểm tra lượt gửi vừa xác nhận.', { exact: true }).waitFor()
    assert.equal(lost.state, 'unknown')
    assert.equal(countReminders(), 1)
    const last = googleProvider.calls.sent.at(-1)
    assert.equal(last.inReplyTo, reminder.original)
    assert.equal(last.threadId, reminder.code + '-thread')
    assert.equal(last.from, reminder.account.address)
    assert.deepEqual(last.to, [reminder.vendor])
    assert.equal(googleProvider.calls.sendAttempts, 4)
    const pendingMove = await appFetch(api, { method: 'POST', headers: json, body: JSON.stringify({
      action: 'schedule-followup', id: reminder.id, on: day(3), expected: approval.key,
    }) })
    assert.equal(pendingMove.status, 409)
    record('the provider accepted one authorized reminder in the original thread despite both acknowledgements being lost', true)

    await context.close()
    await restartNext()
    await open({ width: 390, height: 844 }, storage)
    await clockAt(page, start + 3 * dayMs)
    await goInbox()
    await row(reminder).getByRole('button', { name: 'Kiểm tra thư nhắc' }).click()
    await page.getByRole('dialog', { name: 'Kiểm tra thư nhắc' }).getByRole('button', { name: 'Kiểm tra trạng thái gửi' }).click()
    await row(reminder).getByText('Đã gửi thư nhắc', { exact: true }).waitFor()
    const replays = await Promise.all([act(approval), act(approval), act({ action: 'check-followup', id: reminder.id })])
    assert.ok(replays.every(result => result.operationId === lost.operationId && result.state === 'accepted'))
    assert.equal(countReminders(), 1)
    assert.equal(googleProvider.calls.sendAttempts, 4)
    assert.equal(smtpWire.state.messages.length, 0)
    assert.equal(sql(`SELECT count(*) FROM public.emails WHERE user_id='${userId}'
      AND direction='outbound' AND message_id='${last.messageId}'`).trim(), '1')
    await capture('recovered-reminder-mobile')
    record('mobile verification reconciles Sent after restart and three replays retain one reminder and one Sent row', true)

    incoming(reminder, 'dap-nhac', 'Đã nhận lời nhắc và sẽ kiểm tra lại.', last.messageId, start + 3 * dayMs)
    await sync()
    assert.equal((await queue(reminder)).status, 'reply')
    await clockAt(page, start + 4 * dayMs)
    await page.reload()
    await due().getByText(moved.name, { exact: false }).waitFor()
    assert.equal(await due().getByRole('listitem').count(), 1)
    const movedPreview = await preview(moved)
    incoming(moved, 'dap-muon', 'Đã đối chiếu xong hóa đơn.', moved.original, start + 4 * dayMs)
    // No explicit sync here. Approval itself must fetch this reply before dispatch.
    await movedPreview.getByRole('button', { name: 'Xác nhận gửi thư nhắc' }).click()
    await movedPreview.getByRole('alert').getByText(/Lịch hẹn hoặc hồi đáp đã thay đổi/).waitFor()
    await movedPreview.getByRole('button', { name: 'Đóng', exact: true }).click()
    await row(moved).getByText(/Có hồi đáp/).waitFor()
    assert.equal(countReminders(), 1)
    assert.equal(googleProvider.calls.sendAttempts, 4)
    record('the moved date appears at its new boundary and a provider reply during preview cancels the unclaimed send', true)

    await row(moved).getByRole('button', { name: 'Đã xem' }).click()
    await row(moved).waitFor({ state: 'hidden' })
    assert.equal(await queue(moved), undefined)
    const foreign = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const session = await foreign.auth.signInWithPassword({ email: previousEmail, password })
    assert.equal(session.error, null)
    assert.equal((await foreign.rpc('schedule_reply_followup', { p_id: reminder.id, p_on: day(5), p_expected: approval.key })).error?.code, 'PT404')
    assert.equal((await foreign.rpc('read_reply_followup_receipt', { p_id: reminder.id })).data, null)
    const anonClient = createClient(base, anon, { auth: { persistSession: false } })
    assert.ok((await anonClient.rpc('read_reply_followup_preview', { p_id: reminder.id })).error)
    assert.ok((await login.rpc('begin_reply_followup', { p_user_id: userId, p_account_id: reminder.account.id,
      p_draft: reminder.id, p_key: approval.key, p_hash: approval.proof, p_payload: {} })).error)
    assert.deepEqual(pageErrors, [])
    record('follow-up acknowledgement closes the item and account ownership and service-only dispatch are enforced', true)
    writeFileSync(output + '/workflow.json', JSON.stringify({
      accounts: 2, conversations: conversations.length, scheduled: day(2), rescheduled: day(4),
      initialReplies: 3, reminderAttempts: googleProvider.calls.sendAttempts - 3,
      reminderOperations: countReminders(), sameReceiptReplays: replays.length, capturedViewports: ['desktop', 'mobile'],
    }, null, 2) + '\n')
  } catch (error) {
    await page?.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
