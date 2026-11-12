import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const api = '/api/gmail-triage'
const body = value => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const shared = 'same-provider-id'
const titleA = 'Hóa đơn văn phòng'
const titleB = 'Hóa đơn chi nhánh'
const outside = 'Lịch họp ngoài phạm vi'

export async function rehearseGmailTriage({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
  previousEmail, previousId, anon, restartNext, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address, actor = userId, canModify = true) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address, false, canModify)
    await vault.write({ userId: actor, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, sendDisabled: true,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const a = await mailbox('van-phong@example.test')
  const b = await mailbox('chi-nhanh@example.test')
  const foreign = await mailbox('ngoai-pham-vi@example.test', previousId)
  const message = (id, subject, labelIds = ['INBOX', 'UNREAD']) => ({
    id, subject, labelIds, at: new Date().toISOString(), from: 'ke-toan@example.test',
    body: 'Nội dung tổng hợp để kiểm thử thao tác Inbox.', messageId: `<${id}@example.test>`, threadId: 'thread-' + id,
  })
  a.deliver([message(shared, titleA), message('outside', outside, ['INBOX', 'UNREAD', 'LABEL_KEEP'])])
  b.deliver([message(shared, titleB, ['INBOX', 'UNREAD', 'LABEL_FINANCE'])])
  foreign.deliver([message(shared, 'Hóa đơn người dùng khác')])
  async function sync() {
    const response = await appFetch('/api/source-accounts/sync', body({ mode: 'incremental' }))
    assert.ok(response.ok)
    return response.json()
  }
  await sync()
  const labelIds = (account, id = shared) => account.box.messages.get(id).labelIds
  const writes = () => googleProvider.calls.modifications.length
  const dbId = account => sql(`SELECT id FROM public.emails WHERE source_account_id='${account.id}' AND original_uid='${shared}'`).trim()
  const idA = dbId(a), idB = dbId(b)
  assert.match(idA, /^[a-f0-9-]{36}$/)
  assert.match(idB, /^[a-f0-9-]{36}$/)
  assert.notEqual(idA, idB)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let context, page, allowAutoSync = false
  const pageErrors = []
  async function open(viewport, storageState) {
    context = await browser.newContext({ locale: 'vi-VN', viewport, storageState,
      timezoneId: 'Asia/Ho_Chi_Minh', serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (!allowAutoSync && url.pathname === '/api/source-accounts/sync') return route.fulfill({ json: { synced: 0 } })
      return route.continue()
    })
    page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  const button = name => page.getByRole('button', { name, exact: true })
  const region = () => page.getByRole('region', { name: 'Đồng bộ thao tác Gmail' })
  const jobs = () => region().locator('ol > li')
  async function openJobs() {
    const summary = region().locator('summary')
    await summary.waitFor()
    if (!await region().locator('details').evaluate(node => node.open)) await summary.click()
  }
  async function status(subject, state, job = jobs().first()) {
    await job.locator('ul > li').filter({ hasText: subject }).getByText(state, { exact: false }).waitFor()
  }
  async function selectInbox(...subjects) {
    for (const subject of subjects) {
      const select = button('Chọn thư: ' + subject)
      await select.click()
      assert.equal(await select.getAttribute('aria-pressed'), 'true')
    }
  }
  async function waitJob(action, operation, expected = 200) {
    const received = page.waitForResponse(response => response.url() === app + api &&
      response.request().method() === 'POST' && response.request().postDataJSON().action === action)
    const [response] = await Promise.all([received, operation()])
    const json = await response.json()
    assert.equal(response.status(), expected, JSON.stringify(json))
    return json.job
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
  }
  async function apply(action, label) {
    return waitJob(action, () => {
      const target = action === 'apply'
        ? page.getByRole('group', { name: 'Thao tác thư đã chọn' }).getByRole('button', { name: label, exact: true })
        : button(label)
      return target.click()
    })
  }

  try {
    await open({ width: 1440, height: 900 })
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
    await selectInbox(titleA, titleB)
    b.box.dropModifyAcknowledgement = true
    let saved
    await page.route(app + api, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      saved = await (await route.fetch()).json()
      await context.setOffline(true)
      await route.abort()
    }, { times: 1 })
    await button('Lưu trữ').click()
    await region().getByRole('alert').waitFor()
    assert.ok(saved.job, JSON.stringify(saved))
    assert.equal(saved.job.items.find(item => item.emailId === idA).state, 'verified')
    assert.equal(saved.job.items.find(item => item.emailId === idB).state, 'pending')
    assert.equal(writes(), 2)
    assert.ok(!labelIds(a).includes('INBOX') && !labelIds(b).includes('INBOX'))
    assert.ok(labelIds(a, 'outside').includes('INBOX'))
    record('Cross-account archive distinguishes identical provider IDs and preserves the out-of-scope message', true)

    const storageState = await context.storageState()
    await context.close()
    await restartNext()
    await open({ width: 390, height: 844 }, storageState)
    await page.goto(app + '/inbox')
    await openJobs()
    await status(titleA, 'Đã xác minh')
    await status(titleB, 'Đang chờ đồng bộ')
    await capture('01-cho-xac-minh-mobile')
    const recovered = await apply('check', 'Kiểm tra lại')
    assert.equal(recovered.id, saved.job.id)
    await status(titleB, 'Đã đối chiếu sau gián đoạn')
    assert.equal(writes(), 2)
    assert.equal(recovered.items.find(item => item.emailId === idB).canUndo, false)
    assert.equal(await button('Chọn thư: ' + titleB).count(), 0)
    record('After lost Gmail and browser acknowledgements, restart and read-back verify without another write', true)

    await context.close()
    await open({ width: 1440, height: 900 }, storageState)
    await page.goto(app + '/archive')
    await page.getByRole('checkbox', { name: 'Chọn thư: ' + titleA }).check()
    await page.getByRole('checkbox', { name: 'Chọn thư: ' + titleB }).check()
    const restored = await apply('apply', 'Đưa về hộp thư')
    assert.ok(restored.items.every(item => item.state === 'verified'))
    assert.ok(labelIds(a).includes('INBOX') && labelIds(b).includes('INBOX'))
    record('Archive folder restores both selected messages to both Gmail inboxes', true)

    await page.goto(app + '/inbox')
    await selectInbox(titleA, titleB)
    const read = await apply('apply', 'Đã đọc')
    assert.ok(read.items.every(item => item.state === 'verified'))
    assert.ok(!labelIds(a).includes('UNREAD') && !labelIds(b).includes('UNREAD'))
    await page.getByRole('button', { name: 'Chọn thư: ' + titleA }).waitFor()
    await selectInbox(titleA, titleB)
    const unread = await apply('apply', 'Chưa đọc')
    assert.ok(unread.items.every(item => item.state === 'verified'))
    assert.ok(labelIds(a).includes('UNREAD') && labelIds(b).includes('UNREAD'))
    record('Batch mark read and unread update both providers and refresh the Inbox', true)

    await page.getByRole('button', { name: 'Chọn thư: ' + titleA }).waitFor()
    await selectInbox(titleA, titleB)
    const starred = await apply('apply', 'Gắn sao')
    assert.ok(starred.items.every(item => item.canUndo))
    assert.ok(labelIds(a).includes('STARRED') && labelIds(b).includes('STARRED'))

    // Change the same label away and back outside InboxAI. Its final value is identical,
    // so the undo must use provider historyId and cannot rely on a boolean comparison.
    a.changeLabels(shared, [], ['STARRED'])
    a.changeLabels(shared, ['STARRED'], [])
    a.changeLabels('outside', ['STARRED'], ['UNREAD'])
    // Make the existing one-minute scheduler window due without sleeping.
    sql(`UPDATE public.source_accounts SET last_sync_at=clock_timestamp()-interval '2 minutes'
      WHERE user_id='${userId}' AND id IN ('${a.id}','${b.id}')`)
    allowAutoSync = true
    const incomingSync = page.waitForResponse(response => response.url() === app + '/api/source-accounts/sync')
    await page.reload()
    const incomingResult = await (await incomingSync).json()
    assert.ok(incomingResult.synced >= 2, JSON.stringify(incomingResult))
    await page.getByText('Đã đồng bộ ' + incomingResult.synced + ' email', { exact: true }).waitFor()
    assert.equal(await page.getByText('Email mới', { exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Gắn sao: ' + outside }).waitFor()
    await page.waitForFunction(subject => document.querySelector(`button[aria-label="Gắn sao: ${subject}"]`)?.getAttribute('aria-pressed') === 'true', outside)
    await page.getByRole('button', { name: /Mở thư: Lịch họp ngoài phạm vi/ }).waitFor()
    assert.ok(!await page.getByRole('button', { name: /Mở thư: Lịch họp ngoài phạm vi.*chưa đọc/ }).count())
    record('External Gmail label history refreshes Inbox flags in the running browser', true)

    await openJobs()
    const beforeUndo = writes()
    const undo = await waitJob('undo', () => jobs().first().getByRole('button', { name: 'Hoàn tác', exact: true }).click())
    assert.equal(undo.undoOf, starred.id)
    assert.equal(undo.items.find(item => item.emailId === idA).state, 'conflict')
    assert.equal(undo.items.find(item => item.emailId === idB).state, 'verified')
    assert.equal(writes(), beforeUndo + 1)
    assert.ok(labelIds(a).includes('STARRED') && !labelIds(b).includes('STARRED'))
    assert.ok(labelIds(b).includes('LABEL_FINANCE') && labelIds(a, 'outside').includes('LABEL_KEEP'))
    await status(titleA, 'Có thay đổi mới hơn trên Gmail')
    await status(titleB, 'Đã xác minh')
    await capture('02-hoan-tac-mot-phan')
    record('Undo detects an external ABA label change, restores only the unchanged target and preserves unrelated labels', true)

    await page.goto(app + '/starred')
    await page.getByRole('checkbox', { name: 'Chọn thư: ' + titleA }).check()
    const unstar = await apply('apply', 'Bỏ gắn sao')
    assert.equal(unstar.items[0].state, 'verified')
    assert.ok(!labelIds(a).includes('STARRED'))
    assert.ok(labelIds(a, 'outside').includes('STARRED'))
    record('Starred folder removes a selected star and keeps the unrelated message starred', true)

    // Existing provider permission can be revoked. Denial stays visible and cannot
    // be mistaken for a successful local write.
    b.box.denyModify = true
    await page.goto(app + '/inbox')
    await selectInbox(titleB)
    const denied = await apply('apply', 'Lưu trữ')
    assert.equal(denied.items[0].state, 'blocked')
    assert.ok(labelIds(b).includes('INBOX'))
    await openJobs()
    await status(titleB, 'Tài khoản thiếu quyền Gmail')
    record('Provider permission denial is shown for the affected item without reporting it as verified', true)

    const single = await waitJob('apply', () => button('Gắn sao: ' + outside).click())
    assert.equal(single.items.length, 1)
    assert.equal(single.items[0].state, 'verified')
    assert.ok(!labelIds(a, 'outside').includes('STARRED') && labelIds(a, 'outside').includes('LABEL_KEEP'))
    record('The single-message star control uses the same verified Gmail path', true)

    const other = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const login = await other.auth.signInWithPassword({ email: previousEmail, password })
    assert.ifError(login.error)
    const bearer = { authorization: 'Bearer ' + login.data.session.access_token, 'content-type': 'application/json' }
    const prior = writes()
    for (const command of [
      { action: 'check', id: starred.id },
      { action: 'undo', id: starred.id },
      { action: 'apply', id: randomUUID(), flag: 'starred', desired: false, emailIds: [idA] },
    ]) {
      const res = await fetch(app + api, { ...body(command), headers: bearer })
      assert.equal(res.status, 404)
    }
    const anonDenied = await fetch(app + api)
    assert.equal(anonDenied.status, 401)
    assert.equal(writes(), prior)
    assert.deepEqual(labelIds(foreign), ['INBOX', 'UNREAD'])
    assert.deepEqual(pageErrors, [])
    record('Anonymous and foreign actors cannot read, repeat or undo another tenant’s action', true)
    record('Checked desktop and mobile screenshots have no horizontal overflow or axe violations', true)

    await writeFile(output + '/workflow.json', JSON.stringify({
      accounts: 2, providerWrites: writes(), recovery: recovered, undo, denied, pageErrors,
    }, null, 2) + '\n')
  } catch (error) {
    await page?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
