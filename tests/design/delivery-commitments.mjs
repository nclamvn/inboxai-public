import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'
import { cases, scoreCase, writeResult } from '../eval/commitments/delivery/evaluate.mjs'
import { audit } from './browser.mjs'

const ledger = '/api/commitments'
const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const button = (page, name) => page.getByRole('button', { name, exact: true })

export async function rehearseDeliveryCommitments({ app, base, email, previousEmail, password, userId, admin, appFetch, googleProvider, record, output }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  const accounts = {}
  for (const name of ['mua-hang', 'ky-thuat']) {
    const address = name + '@delivery.example.test'
    const account = googleProvider.registerMailbox(address, true)
    const id = randomUUID()
    await vault.write({ userId, accountId: id }, {
      kind: 'google', accessToken: account.tokens.access_token, refreshToken: account.tokens.refresh_token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), scope: account.tokens.scope,
      googleSubject: address, sendDisabled: false,
    }, 0, { email_address: address, provider: 'gmail' })
    accounts[name] = { ...account, id, address }
  }

  async function api(path, init, expected = 200) {
    const res = await appFetch(path, init)
    const data = await res.json()
    assert.equal(res.status, expected, path + ' ' + JSON.stringify(data))
    return data
  }

  async function receive(row, mail) {
    const uid = row.id + '-' + mail.id
    accounts[mail.account].deliver([{ id: uid, threadId: row.id + '-' + mail.account, messageId: '<' + uid + '@example.test>',
      from: mail.sender, at: mail.at, subject: mail.subject + ' · ' + mail.id, body: mail.body }])
    for (let i = 0; i < 4; i++) {
      await api('/api/source-accounts/sync', post({ refresh: true }))
      const result = await admin.from('emails').select('id').eq('user_id', userId)
        .eq('source_account_id', accounts[mail.account].id).eq('original_uid', uid).maybeSingle()
      assert.equal(result.error, null)
      if (result.data) return result.data.id
    }
    throw new Error('Gmail fixture message did not synchronize: ' + uid)
  }

  const browser = await chromium.launch({ channel: 'chrome', proxy: { server: 'http://127.0.0.1:1', bypass: '127.0.0.1' } })
  let page
  const runtimeErrors = []
  async function session(address) {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', viewport: { width: 1380, height: 920 } })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => [app, base].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    const target = await context.newPage()
    target.on('pageerror', error => runtimeErrors.push(error.message))
    target.setDefaultTimeout(15_000)
    await target.goto(app + '/login')
    await target.getByLabel('Email', { exact: true }).fill(address)
    await target.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await button(target, 'Đăng nhập').click()
    await target.waitForURL('**/inbox')
    return target
  }
  async function capture(name) {
    assert.deepEqual(await audit(page), [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: output + '/' + name + '.png', animations: 'disabled' })
  }

  const results = []
  let mainId
  let historySources = 0
  let lost = false
  try {
    page = await session(email)
    await page.route('**/api/commitments/detections', async route => {
      if (lost || route.request().method() !== 'POST' || route.request().postDataJSON().state.delivery?.delivered !== 50) return route.continue()
      const response = await route.fetch({ maxRetries: 0 })
      if (response.status() !== 200) return route.fulfill({ response })
      lost = true
      return route.abort()
    })
    for (const [index, row] of cases.entries()) {
      const primary = index === 0
      const evidence = new Map()
      const targets = new Map()
      const events = []
      let elapsedMs = 0, actions = 0, id, prior
      for (const [step, mail] of row.emails.entries()) {
        const emailId = await receive(row, mail)
        evidence.set(mail.id, emailId)
        const scoped = '/catchup?source=' + emailId
        const begin = performance.now()
        const result = await api(ledger + scoped)
        if (id) assert.equal((await api(ledger + '/' + id)).version, prior.version, 'Reading mail must preserve confirmed state')
        for (const proposal of result.proposals) {
          const command = proposal.review?.command
          const target = command?.operation === 'create' ? mail.id : targets.get(command?.id ?? proposal.commitmentId)
          if (proposal.blocked && !['uncertain','quantity','conflicting'].includes(proposal.blocked)) continue
          if (!target) continue
          const kind = command ? proposal.kind : 'review'
          events.push({ source: mail.id, target, kind, owner: kind === 'create' ? command.state.ownerEmail : null,
            due: ['create','deadline'].includes(kind) ? command.state.dueOn : null,
            received: ['create','progress','completed'].includes(kind) ? command?.state.delivery?.delivered ?? null : null, quote: proposal.quote })
          if (!command) {
            if (primary && step === 1) {
              await page.goto(app + '/inbox')
              const region = page.getByRole('region', { name: 'Cam kết cần chú ý' })
              await region.getByText(proposal.quote, { exact: true }).waitFor()
              assert.equal(prior.state.dueOn, '2026-11-15')
              assert.equal(googleProvider.calls.sendAttempts, 0)
              await capture('01-lich-de-nghi')
              const response = await api(ledger + '/detections', { ...post({ operation: 'revise', id, expectedVersion: prior.version,
                referenceKey: prior.referenceKey, sourceFingerprint: createHash('sha256').update('forged').digest('hex'),
                state: { ...prior.state, dueOn: '2026-11-19', review: undefined }, evidence: { emailId, field: 'body_text', quote: proposal.quote } }),
                headers: { ...post({}).headers, 'Idempotency-Key': randomUUID() } }, 409)
              assert.ok(response.error)
            }
            continue
          }
          const proof = scoreCase(row, [events.at(-1)])
          if (!proof.correct) continue
          if (primary) {
            await page.goto(app + '/commitments?group=waiting&view=catchup&source=' + emailId)
            await page.getByText(proposal.quote, { exact: true }).waitFor()
            await button(page, 'Xem và xác nhận').click()
            const preview = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
            await preview.getByText(proposal.quote, { exact: true }).waitFor()
            await button(preview, 'Xác nhận và ghi vào sổ').click()
            if (step === 2) await button(preview, 'Thử lưu lại').click()
            await preview.waitFor({ state: 'hidden' })
            actions += step === 2 ? 3 : 2
            if (!id) {
              const list = await api(ledger)
              id = list.items.find(item => item.referenceKey === command.referenceKey).id
            }
          } else {
            const send = post(command)
            const receipt = await api(ledger + '/detections', { ...send,
              headers: { ...send.headers, 'Idempotency-Key': randomUUID() } }, command.operation === 'create' ? 201 : 200)
            id = receipt.id
            actions++
          }
          targets.set(id, target)
          const next = await api(ledger + '/' + id)
          assert.equal(next.version, (prior?.version ?? 0) + 1)
          const anchor = next.history[0].sources[0]
          assert.deepEqual([anchor.emailId, anchor.quote, anchor.availability], [emailId, proposal.quote, 'available'])
          historySources++
          prior = next
          if (primary && step === 2) {
            assert.equal(prior.state.status, 'open')
            assert.equal(prior.state.delivery.delivered, 50)
            assert.equal(prior.state.dueOn, '2026-11-15')
            await page.goto(app + '/commitments?group=waiting&id=' + id)
            await page.getByText('50 / 200 bộ', { exact: true }).first().waitFor()
            await capture('02-giao-mot-phan')
          }
        }
        elapsedMs += performance.now() - begin
      }
      results.push({ id: row.id, events, elapsedMs, actions })
      if (primary) {
        mainId = id
        assert.equal(prior.state.dueOn, '2026-11-19')
        assert.equal(prior.state.status, 'completed')
        assert.equal(prior.state.delivery.delivered, 200)
        assert.equal(prior.version, 4)
        await page.goto(app + '/commitments?group=closed&id=' + id)
        await page.getByText('200 / 200 bộ', { exact: true }).first().waitFor()
        await page.getByRole('link', { name: row.emails[4].subject + ' · m5', exact: true }).click()
        await page.waitForURL('**/inbox?email=' + evidence.get('m5'))
        const answer = await api('/api/ask-inbox/answer', post({ query: 'Đối chiếu ngày giao PO-6831' }))
        const claim = answer.claims.find(item => item.field === 'deliveryDate')
        assert.equal(claim.status, 'conflicting')
        assert.deepEqual(claim.observations.map(item => item.value.iso).sort(), ['2026-11-15','2026-11-19'])
        assert.ok(claim.unclear.some(item => item.emailId === evidence.get('m2')),
          'Ask must cite the tentative request separately: ' + JSON.stringify({ expected: evidence.get('m2'), unclear: claim.unclear }))
        await page.goto(app + '/search')
        await page.getByLabel('Nội dung tìm kiếm', { exact: true }).fill('Đối chiếu ngày giao PO-6831')
        await button(page, 'Hỏi email').click()
        await page.getByRole('heading', { name: 'Ngày giao hàng', exact: true }).waitFor()
        await page.getByText('15/11/2026', { exact: true }).waitFor()
        await page.getByText('19/11/2026', { exact: true }).waitFor()
        await capture('03-doi-chieu-nguon')
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(app + '/commitments?group=closed&id=' + id)
        await page.getByText('200 / 200 bộ', { exact: true }).first().waitFor()
        await capture('04-cam-ket-di-dong')
        await page.setViewportSize({ width: 1380, height: 920 })
        record('two Gmail inboxes preserve the confirmed date, record partial delivery after lost acknowledgment, close at full quantity and cite both Ask dates', lost)
      }
    }
    writeResult('product', { cases: results, mode: 'Chrome review on first case; API review using locked labels on remaining cases',
      anchoredRevisions: historySources })
    const totals = results.map(run => scoreCase(cases.find(row => row.id === run.id), run.events))
    const correct = totals.reduce((sum, item) => sum + item.correct, 0)
    const expected = totals.reduce((sum, item) => sum + item.expected, 0)
    record('delivery recall is at least 90% on the locked corpus and every approved revision retains its exact available quote',
      correct / expected >= 0.9 && historySources > 0)
    assert.equal(googleProvider.calls.sendAttempts, 0)
    const overdue = { id: 'PO-7053' }
    const sentTo = 'nha-cung-cap-reminder@example.test'
    const due = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)
    const pendingMail = await receive(overdue, { id: 'm1', account: 'mua-hang', sender: sentTo,
      at: new Date(Date.now() - 5 * 86400000).toISOString(),
      subject: '[PO-7053] Chờ giao phụ tùng', body: 'Chúng tôi xác nhận giao 24 bộ phụ tùng ngày ' + due + '.' })
    const proposal = (await api(ledger + '/catchup?source=' + pendingMail)).proposals[0]
    const command = post(proposal.review.command)
    const created = await api(ledger + '/detections', { ...command,
      headers: { ...command.headers, 'Idempotency-Key': randomUUID() } }, 201)
    await page.goto(app + '/inbox')
    const task = page.getByRole('region', { name: 'Cam kết cần chú ý' }).getByRole('listitem').filter({ hasText: 'giao 24 bộ phụ tùng' })
    await button(task, 'Xem trước lời nhắc').click()
    const reminder = page.getByRole('dialog', { name: 'Xem trước lời nhắc' })
    await reminder.getByText(sentTo, { exact: true }).waitFor()
    assert.equal(googleProvider.calls.sendAttempts, 0)
    const path = ledger + '/' + created.id + '/reminder'
    const preview = await api(path)
    const approved = post({ accountId: preview.accountId, version: preview.version, proof: preview.proof })
    const response = page.waitForResponse(res => new URL(res.url()).pathname === path && res.request().method() === 'POST')
    await button(reminder, 'Xác nhận và gửi lời nhắc').click()
    const receipt = await (await response).json()
    assert.equal(receipt.state, 'accepted', JSON.stringify(receipt))
    await reminder.getByText('Đã gửi lời nhắc', { exact: true }).waitFor()
    const replay = await api(path, approved)
    assert.equal(replay.state, 'accepted')
    assert.equal(googleProvider.calls.sendAttempts, 1)
    assert.equal(googleProvider.calls.sent[0].from, accounts['mua-hang'].address)
    assert.deepEqual(googleProvider.calls.sent[0].to, [sentTo])
    await capture('05-loi-nhac-da-duyet')
    record('explicitly approved overdue reminder uses the cited account and replay sends only once', true)
    const anonymous = await fetch(app + ledger + '/' + mainId)
    assert.equal(anonymous.status, 401)
    assert.equal((await admin.from('whitelist').upsert({ email: previousEmail, is_active: true }, { onConflict: 'email' })).error, null)
    const stranger = await session(previousEmail)
    assert.equal((await stranger.request.get(app + ledger + '/' + mainId)).status(), 404)
    assert.deepEqual(runtimeErrors, [])
    record('no unapproved provider dispatch or foreign tenant ledger access', true)
  } catch (error) {
    await page?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
