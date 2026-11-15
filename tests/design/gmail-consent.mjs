import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { canReadGmail, canSendGmail, gmailReadScope, gmailSendScope, googleEmailScope } from '../../src/lib/gmail/scopes.ts'
import { gmailFixtureEmail, gmailFixtureSubject } from '../local-auth/google-oauth.mjs'
import { vaultKeys } from '../local-auth/vault.mjs'

const readScopes = [gmailReadScope, googleEmailScope]
const bothScopes = [...readScopes, gmailSendScope]
const sendStart = '/api/source-accounts/google/send'
const permissionMessage = 'Gmail chưa cho phép gửi từ tài khoản này. Hãy cấp quyền gửi trong Cài đặt.'

export async function rehearseGmailConsent({ app, base, email, password, userId, login, admin, record, loopbackFetch, googleProvider,
  foreignAccountId, output }) {
  const browser = await chromium.launch({
    ...(process.env.INBOXAI_CHROMIUM_PATH ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' }),
    proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' },
  })
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  let page, step = 'Đăng nhập cho kiểm thử Gmail', scenario, callback, accountId
  const provider = googleProvider.calls
  try {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block' })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    function consentPage(url) {
      assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
      callback = googleProvider.authorize(url, scenario.decision, app, scenario.intent)
      const href = callback.replaceAll('&', '&amp;')
      return `<h1>Google OAuth giả lập</h1><a href="${href}">Tiếp tục kiểm thử</a>`
    }
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'https://accounts.google.com' && url.pathname === '/o/oauth2/v2/auth') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: consentPage(url) })
      }
      if (url.origin === app && url.pathname === '/api/auth/google') {
        // Playwright routes only the first URL in a redirect chain.
        const response = await route.fetch({ maxRedirects: 0 })
        assert.equal(response.status(), 307)
        const headers = response.headers()
        const body = consentPage(new URL(headers.location))
        delete headers.location
        delete headers['content-length']
        return route.fulfill({ status: 200, headers, contentType: 'text/html; charset=utf-8', body })
      }
      if (![app, base].includes(url.origin) || url.pathname === '/api/source-accounts/sync') return route.abort()
      return route.continue()
    })
    page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')

    async function authorize(intent, decision, key, result) {
      scenario = { intent, decision }
      await page.goto(app + '/settings')
      const name = intent === 'read' ? 'Kết nối Gmail để đọc' : `Cấp quyền gửi Gmail cho ${gmailFixtureEmail}`
      await page.getByRole('button', { name, exact: true }).click()
      const next = page.getByRole('link', { name: 'Tiếp tục kiểm thử' })
      await next.waitFor()
      const cookies = (await context.cookies(app)).map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
      await next.click()
      await page.waitForURL(url => url.origin === app && url.pathname === '/settings' && url.searchParams.get(key) === result)
      return { url: callback, cookies }
    }

    async function connectedAccount() {
      const result = await login.from('source_accounts').select('id').eq('email_address', gmailFixtureEmail).maybeSingle()
      assert.equal(result.error, null)
      return result.data?.id
    }
    const credential = () => vault.read({ userId, accountId })

    async function syncInbox({ waitForBackoff = false } = {}) {
      const before = provider.reads
      const deadline = Date.now() + 8_000
      async function sync() {
        const response = await page.request.post(app + `/api/source-accounts/${accountId}/sync`, { data: { fullSync: true } })
        assert.equal(response.status(), 200)
        return response.json()
      }
      let result = await sync()
      while (waitForBackoff && result.busy && Date.now() < deadline) {
        await delay(250)
        result = await sync()
      }
      assert.equal(result.success, true)
      assert.ok(!result.busy && provider.reads > before, 'sync did not read from the Gmail fixture')
      const inbox = await login.from('emails').select('id').eq('source_account_id', accountId).eq('subject', gmailFixtureSubject)
      assert.equal(inbox.error, null)
      assert.equal(inbox.data.length, 1)
    }

    async function compose(subject) {
      await page.goto(app + '/compose')
      await page.getByLabel('Từ', { exact: true }).selectOption(accountId)
      await page.getByLabel('Đến', { exact: true }).fill('warehouse@example.test')
      await page.getByLabel('Tiêu đề', { exact: true }).fill(subject)
      await page.getByRole('textbox', { name: 'Nội dung thư' }).fill('Xác nhận giả lập trong môi trường kiểm thử local.')
      await page.getByRole('button', { name: 'Xem trước thư gửi', exact: true }).click()
      const result = page.waitForResponse(response => response.url() === app + '/api/compose-drafts'
        && response.request().method() === 'POST' && response.request().postDataJSON().action === 'send')
      await page.getByRole('dialog', { name: 'Xem trước thư gửi' }).getByRole('button', { name: 'Xác nhận gửi' }).click()
      const response = await result
      return { status: response.status(), data: await response.json() }
    }

    step = 'Kết nối chỉ đọc Gmail'
    await authorize('read', { scopes: [googleEmailScope], withRefresh: true }, 'error', 'scope_missing')
    assert.equal(await connectedAccount(), undefined)
    await authorize('read', { scopes: readScopes, withRefresh: true }, 'success', 'gmail_connected')
    accountId = await connectedAccount()
    assert.ok(accountId)
    const initial = await credential()
    await syncInbox()
    record('read consent requests only Gmail read and identity, requires an actual read grant, and syncs a synthetic email',
      canReadGmail(initial.credentials.scope) && !canSendGmail(initial.credentials))

    step = 'Chặn gửi trước khi cấp quyền'
    const blocked = await compose('Chưa cấp quyền gửi Gmail')
    await page.getByText(permissionMessage).waitFor()
    const recovery = page.getByRole('link', { name: 'Mở Cài đặt tài khoản' })
    record('Compose blocks before dispatch and opens account settings separately from the draft',
      blocked.status === 403 && blocked.data.code === 'gmail_send_permission_required' && provider.sendAttempts === 0 &&
      await recovery.getAttribute('target') === '_blank' && await recovery.getAttribute('href') === '/settings#email-accounts')

    step = 'Từ chối cấp quyền gửi'
    await authorize('send', { denied: true }, 'gmail_send', 'denied')
    assert.equal((await credential()).revision, initial.revision)
    await syncInbox()
    record('denied send consent preserves the existing credential and inbox sync', true)

    step = 'Cấp thiếu quyền và chọn nhầm hộp thư'
    for (const scopes of [readScopes, [gmailSendScope, googleEmailScope]]) {
      await authorize('send', { scopes, withRefresh: true }, 'gmail_send', 'scope_missing')
      assert.equal((await credential()).revision, initial.revision)
    }
    await authorize('send', { scopes: bothScopes, withRefresh: true, email: 'wrong-mailbox@example.test' }, 'gmail_send', 'account_mismatch')
    await authorize('send', { scopes: bothScopes, withRefresh: true, subject: 'wrong-google-subject' }, 'gmail_send', 'account_mismatch')
    record('partial grants and a different Gmail identity cannot replace the read credential',
      (await credential()).revision === initial.revision)

    step = 'Quyền gửi với refresh token chỉ đọc'
    const refreshes = provider.refreshes
    await authorize('send', { scopes: bothScopes, withRefresh: false }, 'gmail_send', 'scope_missing')
    record('without a new refresh token, an old read-only refresh token cannot persist an upgrade',
      provider.refreshes === refreshes + 1 && (await credential()).revision === initial.revision)

    step = 'Cấp quyền gửi và thử callback lặp'
    const consent = await authorize('send', { scopes: bothScopes, withRefresh: true }, 'gmail_send', 'enabled')
    await page.getByText('Đã cấp quyền gửi Gmail.', { exact: true }).waitFor()
    await page.screenshot({ path: `${output}/gmail-consent.png`, animations: 'disabled' })
    const upgraded = await credential()
    assert.ok(canReadGmail(upgraded.credentials.scope) && canSendGmail(upgraded.credentials))
    const beforeReplay = provider.exchanges
    const replay = await loopbackFetch(consent.url, { headers: { cookie: consent.cookies }, redirect: 'manual' })
    assert.equal(new URL(replay.headers.get('location')).searchParams.get('gmail_send'), 'stale')
    const cookieCleared = await page.request.get(consent.url, { maxRedirects: 0 })
    record('callback replay is rejected before token exchange, even with a captured transaction cookie',
      new URL(cookieCleared.headers().location).searchParams.get('error') === 'invalid_state' &&
      provider.exchanges === beforeReplay && upgraded.revision === initial.revision + 1 &&
      (await credential()).revision === upgraded.revision)
    const sent = await compose('Xác nhận Gmail sau khi cấp quyền')
    await page.waitForURL('**/sent')
    record('explicit send consent enables one synthetic Gmail send on the same account',
      sent.status === 200 && sent.data.state === 'accepted' && provider.sent.length === 1)

    step = 'Google từ chối quyền gửi trong khi vẫn cho đọc'
    googleProvider.setSendRevoked(true)
    const revoked = await compose('Gmail đã thu hồi quyền gửi')
    await page.getByText(permissionMessage).waitFor()
    const attempts = provider.sendAttempts
    const retry = await page.request.post(app + '/api/emails/send', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { sourceAccountId: accountId, to: ['warehouse@example.test'], subject: 'Thử lại khi Gmail đã thu hồi quyền' },
    })
    assert.equal(retry.status(), 403)
    await syncInbox()
    record('Gmail send scope denial persists, avoids further send attempts, and keeps sync working',
      revoked.status === 422 && revoked.data.code === 'gmail_send_permission_required' &&
      provider.sent.length === 1 && provider.sendAttempts === attempts && !canSendGmail((await credential()).credentials))

    step = 'Cấp lại quyền gửi Gmail'
    googleProvider.setSendRevoked(false)
    await authorize('send', { scopes: bothScopes, withRefresh: false }, 'gmail_send', 'enabled')
    const restored = await compose('Xác nhận Gmail sau khi cấp lại quyền')
    await page.waitForURL('**/sent')
    record('verified combined refresh restores sending without creating a second mailbox',
      restored.status === 200 && provider.sent.length === 2 && await connectedAccount() === accountId)

    step = 'Thu hồi toàn bộ quyền Google và kết nối lại chỉ đọc'
    googleProvider.revokeAllGrants()
    const stoppedSync = await page.request.post(app + `/api/source-accounts/${accountId}/sync`, { data: { fullSync: true } })
    assert.equal((await stoppedSync.json()).success, false)
    const stoppedSend = await compose('Gmail đã thu hồi toàn bộ quyền')
    assert.equal(stoppedSend.data.state, 'rejected')
    await authorize('read', { scopes: readScopes, withRefresh: true }, 'success', 'gmail_connected')
    await syncInbox({ waitForBackoff: true })
    record('full grant revocation stops sync and send, and reconnect restores only reading on the same mailbox',
      stoppedSend.status === 422 && provider.sent.length === 2 && await connectedAccount() === accountId &&
      !canSendGmail((await credential()).credentials))

    step = 'Chặn cấp quyền gửi không xác thực hoặc chéo tổ chức'
    const anonymous = await loopbackFetch(app + sendStart, { method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }) })
    const foreign = await page.request.post(app + sendStart, { data: { accountId: foreignAccountId } })
    record('unauthenticated and out-of-scope Gmail authorization starts are blocked',
      anonymous.status === 401 && foreign.status() === 404)
  } catch (error) {
    await page?.screenshot({ path: `${output}/failure.png`, animations: 'disabled', timeout: 5_000 }).catch(() => {})
    throw new Error(`${step}: ${error.message}`, { cause: error })
  } finally {
    await browser.close()
  }
}
