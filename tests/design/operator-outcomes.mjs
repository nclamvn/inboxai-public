import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { audit } from './browser.mjs'

const output = 'docs/phase-2/evidence/m5b'
const endpoint = '/api/operator'
const json = (method, body, key = randomUUID(), headers = {}) => ({
  method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...headers }, body: JSON.stringify(body),
})

export async function rehearseOperator({ app, appFetch, cookies, admin, userId, foreignToken, loopbackFetch, record }) {
  const account = randomUUID()
  assert.equal((await admin.from('source_accounts').insert({
    id: account, user_id: userId, email_address: 'work@example.test', provider: 'custom',
  })).error, null)
  const mail = (sender, subject, extra = {}) => ({
    id: randomUUID(), user_id: userId, source_account_id: account, from_address: sender, subject,
    body_text: 'Dữ liệu giả lập.', received_at: '2026-11-01T08:00:00Z', is_read: false, is_archived: false,
    is_deleted: false, provider_deleted: false, attachment_count: 0, body_fetched: true, direction: 'inbound', ...extra,
  })
  const archive = mail('desktop@example.test', 'Biên bản giao nhận', { is_archived: null })
  const archive2 = mail('desktop@example.test', 'Lịch kiểm kê')
  const readMail = mail('mobile@example.test', 'Hạn phản hồi đã xác nhận', { is_read: null })
  const conflict = mail('tablet@example.test', 'Bản đã cập nhật sau khi mở')
  const unchanged = mail('tablet@example.test', 'Biên bản cùng kế hoạch')
  const apiMail = mail('api@example.test', 'Thư thử thao tác đồng thời')
  assert.equal((await admin.from('emails').insert([archive, archive2, readMail, conflict, unchanged, apiMail])).error, null)

  async function request(path, options, status = 200) {
    const response = await appFetch(endpoint + path, options)
    const body = await response.json()
    assert.equal(response.status, status, JSON.stringify(body))
    assert.match(response.headers.get('cache-control') ?? '', /private, no-store/)
    return body
  }
  const inspect = id => request('/' + id)
  const patch = (id, body, key, status) => request('/' + id, json('PATCH', body, key), status)
  async function flag(row, field) {
    const result = await admin.from('emails').select(field).eq('id', row.id).eq('user_id', userId).single()
    assert.equal(result.error, null)
    return result.data[field]
  }
  async function run(command, mails) {
    const plan = await request('', json('POST', { command, accountId: account }), 201)
    const approved = await patch(plan.id, { operation: 'approve', previewHash: plan.previewHash, selectedIds: mails.map(row => row.id) })
    const execute = { operation: 'execute', approvedHash: approved.approvedHash }
    assert.equal((await patch(plan.id, execute)).status, 'executed')
    assert.equal((await patch(plan.id, execute)).replayed, true)
    return inspect(plan.id)
  }

  const api = await run('Lưu trữ thư từ api@example.test', [apiMail])
  record('execution read-back logs a single automatic verification despite execute replay',
    api.outcome.events.length === 1 && api.outcome.events[0].event === 'verified' && api.outcome.events[0].matched === 1)
  const key = randomUUID()
  const first = await patch(api.id, { operation: 'verify' }, key)
  const replay = await patch(api.id, { operation: 'verify' }, key)
  await patch(api.id, { operation: 'undo', undoHash: api.outcome.undoHash }, key, 409)
  await patch(api.id, { operation: 'undo', undoHash: api.outcome.undoHash, selectedIds: [archive.id] }, undefined, 400)
  await patch(api.id, { operation: 'undo', undoHash: '0'.repeat(64) }, undefined, 409)
  record('verification retry replays the same journal entry and forged undo inputs are rejected',
    first.id === replay.id && replay.replayed && (await flag(apiMail, 'is_archived')) === true)
  const foreign = await loopbackFetch(app + endpoint + '/' + api.id,
    json('PATCH', { operation: 'undo', undoHash: api.outcome.undoHash }, undefined, { Authorization: 'Bearer ' + foreignToken }))
  const anonymous = await loopbackFetch(app + endpoint + '/' + api.id, json('PATCH', { operation: 'verify' }))
  record('foreign and anonymous callers cannot invoke verification or undo', foreign.status === 404 && anonymous.status === 401)

  const simultaneous = await Promise.all([
    patch(api.id, { operation: 'undo', undoHash: api.outcome.undoHash }),
    patch(api.id, { operation: 'undo', undoHash: api.outcome.undoHash }),
  ])
  record('concurrent undo with different keys returns one restoration and one identical receipt',
    simultaneous[0].id === simultaneous[1].id && simultaneous.filter(result => result.replayed).length === 1 &&
    (await flag(apiMail, 'is_archived')) === false && (await inspect(api.id)).outcome.events.length === 3)

  const desktopPlan = await run('Lưu trữ thư từ desktop@example.test', [archive, archive2])
  const tabletPlan = await run('Lưu trữ thư từ tablet@example.test', [conflict, unchanged])
  const mobilePlan = await run('Đánh dấu đã đọc thư từ mobile@example.test', [readMail])
  mkdirSync(output, { recursive: true })
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const captures = []
  const runtimeErrors = []
  const requestKeys = []
  let loseReply = false
  try {
    for (const [name, viewport, plan] of [
      ['desktop', { width: 1440, height: 900 }, desktopPlan],
      ['tablet', { width: 834, height: 1112 }, tabletPlan],
      ['mobile', { width: 390, height: 844 }, mobilePlan],
    ]) {
      const context = await browser.newContext({ locale: 'vi-VN', viewport, isMobile: name === 'mobile', hasTouch: name !== 'desktop', reducedMotion: 'reduce' })
      await context.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: app })))
      await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
      await context.route('**/*', async route => {
        const req = route.request()
        const url = new URL(req.url())
        if (url.hostname !== '127.0.0.1' || url.pathname === '/api/source-accounts/sync' || url.pathname === '/api/emails/send') return route.abort()
        if (req.method() === 'PATCH' && url.pathname === endpoint + '/' + plan.id && req.postDataJSON()?.operation === 'undo') {
          requestKeys.push(req.headers()['idempotency-key'])
          if (loseReply) {
            loseReply = false
            assert.equal((await route.fetch({ maxRetries: 0 })).status(), 200)
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
      async function capture(label) {
        captures.push({ name: label, viewport, axe: await audit(page) })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await page.screenshot({ path: output + '/' + label + '.png', animations: 'disabled', caret: 'initial',
          style: 'nextjs-portal { visibility: hidden; }' })
      }
      await page.goto(app + '/operator?plan=' + plan.id, { waitUntil: 'networkidle' })
      const panel = page.getByRole('region', { name: 'Xác minh và hoàn tác' })
      await panel.getByRole('status').filter({ hasText: 'Đã xác minh' }).waitFor()
      await panel.getByRole('button', { name: 'Xem trước hoàn tác' }).click()
      const dialog = page.getByRole('dialog', { name: 'Xác nhận hoàn tác' })
      await dialog.waitFor()
      if (name === 'desktop') {
        await dialog.getByText(archive.subject, { exact: true }).waitFor()
        await dialog.getByText(archive2.subject, { exact: true }).waitFor()
        await capture('desktop-undo-preview')
        loseReply = true
      }
      if (name === 'tablet') {
        assert.equal((await admin.from('emails').update({ subject: 'Nội dung đã đổi sau xem trước' })
          .eq('id', conflict.id).eq('user_id', userId)).error, null)
      }
      await dialog.getByRole('button', { name: 'Hoàn tác phạm vi này' }).click()
      if (name === 'desktop') {
        await dialog.getByRole('button', { name: 'Thử hoàn tác lại' }).click()
        await panel.getByRole('status').filter({ hasText: 'Đã hoàn tác' }).waitFor()
        record('browser lost-response retry restores exact NULL and false once and preserves the original key',
          requestKeys[0] === requestKeys[1] && (await flag(archive, 'is_archived')) === null &&
          (await flag(archive2, 'is_archived')) === false &&
          (await inspect(plan.id)).outcome.events.filter(event => event.event === 'undone').length === 1)
        await capture('desktop-undo-receipt')
      }
      if (name === 'tablet') {
        await panel.getByText('Kết quả hiện tại không còn khớp', { exact: true }).waitFor()
        await panel.getByRole('button', { name: 'Xác minh lại' }).click()
        await panel.getByRole('status').filter({ hasText: '1 đã thay đổi' }).waitFor()
        const detail = await inspect(plan.id)
        record('a change after preview blocks the full undo and verification records the discrepancy',
          (await flag(conflict, 'is_archived')) === true && (await flag(unchanged, 'is_archived')) === true &&
          detail.outcome.events.some(event => event.event === 'undo_blocked' && event.changed === 1))
        await capture('tablet-drift')
      }
      if (name === 'mobile') {
        await panel.getByRole('status').filter({ hasText: 'Đã hoàn tác' }).waitFor()
        await page.reload({ waitUntil: 'networkidle' })
        await panel.getByRole('status').filter({ hasText: 'Đã hoàn tác' }).waitFor()
        record('mobile undo restores the original read flag and history survives reload', (await flag(readMail, 'is_read')) === null)
        await panel.scrollIntoViewIfNeeded()
        await capture('mobile-undone')
      }
      await context.close()
    }
    assert.deepEqual(runtimeErrors, [])
    record('desktop, tablet and mobile verification and undo states have no sampled axe violations or overflow',
      captures.length === 4 && captures.every(state => state.axe.length === 0))
    writeFileSync(output + '/browser.json', JSON.stringify({ engine: browser.version(), captures, runtimeErrors }, null, 2) + '\n')
  } finally {
    await browser.close()
  }
}
