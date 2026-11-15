import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { audit } from './browser.mjs'

const zone = 'Asia/Ho_Chi_Minh'
const format = new Intl.DateTimeFormat('sv-SE', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const pickerValue = time => format.format(time).replace(' ', 'T')
const subject = 'Duyệt báo giá'
const uid = 'same-scheduled-message'
const changePath = '/rest/v1/rpc/change_email_snooze'

export async function rehearseEmailSnoozes({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
  previousEmail, anon, restartNext, record, output }) {
  const start = Math.floor(Date.now() / 60_000) * 60_000
  const initialDue = start + 10 * 60_000
  const movedDue = start + 20 * 60_000
  const setDatabaseClock = time => sql(`CREATE OR REPLACE FUNCTION private.email_snooze_now() RETURNS timestamptz
    LANGUAGE sql STABLE SET search_path='' AS $$ SELECT TIMESTAMPTZ '${new Date(time).toISOString()}' $$;`)
  setDatabaseClock(start)
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  async function mailbox(address) {
    const id = randomUUID()
    const fixture = googleProvider.registerMailbox(address)
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: fixture.tokens.access_token, refreshToken: fixture.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: fixture.tokens.scope, sendDisabled: true,
    }, 0, { email_address: address, provider: 'gmail' })
    return { id, address, ...fixture }
  }
  const a = await mailbox('van-phong@example.test')
  const b = await mailbox('chi-nhanh@example.test')
  const fromA = 'bao-gia-cu@example.test'
  const fromB = 'bao-gia-moi@example.test'
  function message(id, title, from, at, labelIds = ['INBOX', 'UNREAD']) {
    return { id, subject: title, from, at: new Date(at).toISOString(), labelIds,
      body: 'Thư giả lập để kiểm thử lịch xử lý.', messageId: `<${id}@example.test>`, threadId: 'thread-' + id }
  }
  a.deliver([message(uid, subject, fromA, start - 30 * 86_400_000, ['INBOX', 'STARRED'])])
  b.deliver(Array.from({ length: 52 }, (_, i) => message('decoy-' + i, 'Bản tin ' + i,
    'ban-tin@example.test', start - (i + 60) * 60_000)))
  b.deliver([message(uid, subject, fromB, start - 60_000)])

  async function sync() {
    const response = await appFetch('/api/source-accounts/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 50, refresh: true }),
    })
    assert.ok(response.ok)
    const result = await response.json()
    assert.ok(result.success, JSON.stringify(result))
    return result
  }
  await sync()
  await sync()
  const idFor = account => sql(`SELECT id FROM public.emails WHERE user_id='${userId}' AND source_account_id='${account.id}' AND original_uid='${uid}'`).trim()
  const idA = idFor(a), idB = idFor(b)
  assert.match(idA, /^[a-f0-9-]{36}$/)
  assert.match(idB, /^[a-f0-9-]{36}$/)
  assert.notEqual(idA, idB)
  const state = id => JSON.parse(sql(`SELECT jsonb_build_object('until',snoozed_until,'version',snooze_version,
    'archived',is_archived,'read',is_read,'starred',is_starred) FROM public.emails WHERE user_id='${userId}' AND id='${id}'`))
  const until = id => state(id).until && Date.parse(state(id).until)

  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  let context, page
  const pageErrors = []
  async function open(viewport, storageState, clock = start) {
    context = await browser.newContext({ locale: 'vi-VN', timezoneId: zone, viewport, storageState,
      serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (![app, base].includes(url.origin)) return route.abort()
      if (url.pathname === '/api/source-accounts/sync') return route.fulfill({ json: { synced: 0 } })
      return route.continue()
    })
    page = await context.newPage()
    await page.clock.install({ time: new Date(clock) })
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => pageErrors.push(error.message))
  }
  const row = id => page.locator(`[data-email-opener="${id}"]`)
  const button = name => page.getByRole('button', { name, exact: true })
  const scheduled = account => page.getByRole('list', { name: 'Thư đã hẹn xử lý' })
    .getByRole('listitem').filter({ hasText: account.address })
  const dialog = () => page.getByRole('dialog')
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png' })
  }
  async function save(time) {
    await dialog().getByLabel(/Ngày và giờ xử lý/).fill(pickerValue(time))
    await dialog().getByRole('button', { name: 'Lưu lịch', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
  }
  async function fromList(id, time) {
    await row(id).click({ button: 'right' })
    await button('Hẹn xử lý').click()
    await save(time)
    await row(id).waitFor({ state: 'hidden' })
  }
  async function openInbox() {
    await page.goto(app + '/inbox')
    await page.getByRole('heading', { name: 'Hộp thư', exact: true }).waitFor()
  }
  async function openSchedules() {
    await page.getByRole('link', { name: 'Đã hẹn', exact: true }).click()
    await page.getByRole('heading', { name: 'Đã hẹn', exact: true }).waitFor()
  }

  try {
    await open({ width: 1440, height: 900 })
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button('Đăng nhập').click()
    await page.waitForURL('**/inbox')
    await row(idB).waitFor()
    assert.equal(await row(idA).count(), 0, 'old message must start outside the first Inbox page')

    await fromList(idB, initialDue)
    await page.goto(app + '/inbox?email=' + idA)
    await button('Thao tác khác').click()
    await button('Hẹn xử lý').click()
    await save(initialDue)
    await page.waitForURL('**/inbox')
    await openSchedules()
    await scheduled(a).waitFor()
    await scheduled(b).waitFor()
    assert.equal(await scheduled(a).locator('time').getAttribute('datetime').then(Date.parse), initialDue)
    assert.equal(await scheduled(b).locator('time').getAttribute('datetime').then(Date.parse), initialDue)
    assert.equal(until(idA), initialDue)
    assert.equal(until(idB), initialDue)
    assert.ok(state(idA).read && state(idA).starred && !state(idB).read)
    await capture('01-hai-tai-khoan-da-hen')
    record('Two identical subjects and provider IDs are snoozed under the correct accounts, preserving read and star flags', true)

    await scheduled(b).getByRole('button', { name: 'Hủy hẹn', exact: true }).click()
    await dialog().getByRole('button', { name: 'Xác nhận hủy hẹn' }).click()
    await dialog().waitFor({ state: 'hidden' })
    await scheduled(b).waitFor({ state: 'hidden' })
    assert.equal(until(idB), null)
    await page.getByRole('link', { name: 'Về hộp thư', exact: true }).click()
    await row(idB).waitFor()
    record('Cancelling one schedule immediately restores only its message to Inbox', true)
    await fromList(idB, movedDue)
    await openSchedules()
    await scheduled(a).getByRole('button', { name: 'Dời hẹn', exact: true }).click()
    await dialog().getByLabel(/Ngày và giờ xử lý/).fill(pickerValue(movedDue))

    let accepted
    await page.route(base + changePath, async route => {
      const response = await route.fetch()
      assert.ok(response.ok(), await response.text())
      accepted = await response.json()
      await context.setOffline(true)
      await route.abort()
    }, { times: 1 })
    await dialog().getByRole('button', { name: 'Lưu lịch', exact: true }).click()
    await dialog().getByRole('alert').waitFor()
    assert.equal(Date.parse(accepted.until), movedDue)
    assert.equal(accepted.version, 2)
    const storage = await context.storageState()
    await context.close()
    await restartNext()
    await open({ width: 390, height: 844 }, storage)
    await page.goto(app + '/snoozed')
    await scheduled(a).waitFor()
    await scheduled(b).waitFor()
    assert.equal(await scheduled(a).locator('time').getAttribute('datetime').then(Date.parse), movedDue)
    assert.equal(state(idA).version, 2)
    await capture('02-khoi-phuc-lich-mobile')
    record('After a persisted move loses the browser acknowledgement, a server restart preserves the new date and version', true)

    b.changeLabels(uid, [], ['INBOX'])
    await sync()
    assert.ok(state(idB).archived)
    await page.reload()
    await scheduled(a).waitFor()
    await scheduled(b).waitFor({ state: 'hidden' })

    const oneMinuteBefore = movedDue - 60_000
    setDatabaseClock(oneMinuteBefore)
    await page.clock.setFixedTime(new Date(oneMinuteBefore))
    await openInbox()
    await page.getByRole('button', { name: /Mở thư: Bản tin/ }).first().waitFor()
    await page.clock.fastForward(30_000)
    assert.equal(await row(idA).count(), 0)
    assert.equal(await row(idB).count(), 0)
    setDatabaseClock(movedDue)
    await page.clock.setFixedTime(new Date(movedDue))
    await page.clock.fastForward(31_000)
    await row(idA).waitFor()
    assert.equal(await row(idA).count(), 1)
    assert.equal(await row(idB).count(), 0)
    assert.equal(await row(idA).getByText('Đến hẹn', { exact: true }).count(), 1)
    assert.ok(state(idA).read && state(idA).starred && !state(idA).archived)
    await capture('03-thu-tro-lai-dung-han')
    record('The open Inbox returns the old message once at the moved deadline and keeps the externally archived message out', true)

    await openSchedules()
    await page.getByText('Chưa có thư đã hẹn', { exact: true }).waitFor()
    const other = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const anonymous = await other.rpc('change_email_snooze', {
      p_email: idA, p_version: 2, p_until: null, p_request: randomUUID(),
    })
    assert.ok(anonymous.error)
    const login = await other.auth.signInWithPassword({ email: previousEmail, password })
    assert.ifError(login.error)
    const denied = await other.rpc('change_email_snooze', {
      p_email: idA, p_version: 2, p_until: null, p_request: randomUUID(),
    })
    assert.equal(denied.error?.code, 'PT404')
    const foreignClock = await other.rpc('email_snooze_clock', { p_accounts: [a.id, b.id] })
    assert.ifError(foreignClock.error)
    assert.equal(foreignClock.data.nextAt, null)
    assert.equal(googleProvider.calls.modifications.length, 0)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    assert.deepEqual(pageErrors, [])
    record('Anonymous and other users cannot change schedules, with zero provider writes and zero sends', true)
    record('Sampled desktop and mobile states have no axe violations, horizontal overflow or uncaught errors', true)

    await writeFile(output + '/workflow.json', JSON.stringify({
      accounts: 2, initialDue: new Date(initialDue).toISOString(), movedDue: new Date(movedDue).toISOString(),
      returning: state(idA), archived: state(idB), providerWrites: googleProvider.calls.modifications.length, pageErrors,
    }, null, 2) + '\n')
  } catch (error) {
    await page?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
