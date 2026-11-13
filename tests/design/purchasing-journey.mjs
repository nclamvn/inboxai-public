import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { vaultKeys } from '../local-auth/vault.mjs'

const reference = 'PO-731'
const vendor = 'supplier@example.test'
const title = 'giao lô linh kiện kiểm định'
const reason = 'Lý do đổi lịch: lô linh kiện cần kiểm định lại trước khi bàn giao.'
const sendSubject = 'Xác nhận đã nhận lịch mới PO-731'

export async function seedPurchasingJourney({ admin, sql, userId, foreignId, ownEmailId, otherEmailId }) {
  const work = randomUUID(), finance = randomUUID(), outsider = randomUUID()
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  await vault.write({ userId, accountId: work }, { kind: 'imap', password: 'synthetic-smtp-wire' }, 0, {
    email_address: 'smtp-wire@example.test', display_name: 'Mua hàng', provider: 'custom', username: 'smtp-wire@example.test',
    smtp_host: 'smtp-wire.example.test', smtp_port: 465, smtp_secure: true,
  })
  const accounts = await admin.from('source_accounts').insert([
    { id: finance, user_id: userId, email_address: 'finance@example.test', display_name: 'Kế toán', provider: 'custom' },
    { id: outsider, user_id: foreignId, email_address: 'outside@example.test', display_name: 'Tổ chức khác', provider: 'custom' },
  ])
  assert.equal(accounts.error, null)
  sql(`INSERT INTO public.whitelist(email, is_active)
    SELECT lower(email), true FROM auth.users WHERE id='${foreignId}' ON CONFLICT (email) DO NOTHING;
    INSERT INTO private.account_sync(account_id,user_id,provider,retry_at)
    SELECT id,user_id,'imap','infinity'::timestamptz FROM public.source_accounts WHERE id IN ('${work}', '${finance}', '${outsider}');
    DELETE FROM public.emails WHERE id IN ('${ownEmailId}', '${otherEmailId}');`)

  const now = Date.now()
  const moment = hours => new Date(now + hours * 3_600_000).toISOString()
  const oldDate = moment(48).slice(0, 10), newDate = moment(96).slice(0, 10)
  const mail = (account, subject, body, hours, extra = {}) => ({
    id: randomUUID(), user_id: userId, source_account_id: account, subject, body_text: body,
    from_address: vendor, from_name: 'Lê Bình · Linh kiện An Phú', snippet: body.split('\n').at(-1),
    received_at: moment(hours), created_at: moment(hours), body_fetched: true,
    direction: 'inbound', category: 'work', is_read: false, is_archived: false,
    ...extra,
  })
  const original = mail(work, `Xác nhận lịch giao [${reference}]`,
    `Chúng tôi cam kết sẽ ${title} trước ngày ${oldDate}.\nNgày giao hàng: ${oldDate}.`, -8)
  const moved = mail(work, `Đổi lịch giao [${reference}]`,
    `Chúng tôi dời hạn sang ngày ${newDate}.\nNgày giao hàng: ${newDate}.\n${reason}\nVui lòng xác nhận lịch mới.`, -2)
  const accounting = mail(finance, `Đối chiếu lịch giao [${reference}]`,
    `Ngày giao hàng: ${newDate}.\nKế toán đã ghi nhận thay đổi trên đơn mua.`, -1,
    { from_address: 'finance-team@example.test', from_name: 'Đỗ An · Kế toán' })
  const foreign = mail(outsider, `Hồ sơ riêng [${reference}]`,
    'Ngày giao hàng: 2099-09-09.\nThông tin chỉ dành cho tổ chức khác.', -1, { user_id: foreignId })
  const newsletter = mail(work, 'Bản tin thiết bị tháng này', 'Mời xem danh mục thiết bị.', -3,
    { from_address: 'newsletter@example.test', from_name: 'Bản tin thiết bị', category: 'newsletter' })
  const inserted = await admin.from('emails').insert([original, moved, accounting, foreign, newsletter], { defaultToNull: false })
  assert.equal(inserted.error, null)
  return { work, original, moved, accounting, foreign, oldDate, newDate }
}

export async function rehearsePurchasingJourney({ app, base, email, previousEmail, password, fixture, record, admin, login,
  loopbackFetch, smtpWire, mailpit, output }) {
  const { original, moved, accounting, foreign, oldDate, newDate, work } = fixture
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  const origins = new Set([app, base])
  let page, step = 'Đăng nhập'
  const runtimeErrors = []
  async function signIn(address, options) {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', ...options })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => origins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    page = await context.newPage()
    page.setDefaultTimeout(10_000)
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await page.goto(app + '/login')
    await page.getByLabel('Email', { exact: true }).fill(address)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForURL('**/inbox')
  }
  const readEmail = async id => {
    const result = await login.from('emails').select('is_archived').eq('id', id).single()
    assert.equal(result.error, null)
    return result.data
  }
  async function read(path, status = 200) {
    const response = await page.request.get(app + path, { maxRedirects: 0 })
    assert.equal(response.status(), status, path)
    return response.json()
  }

  try {
    await signIn(email, { viewport: { width: 1440, height: 900 } })
    step = 'Action Inbox'
    await page.getByRole('button', { name: `Ưu tiên và nguồn: ${moved.subject}`, exact: true }).click()
    const priority = page.getByRole('dialog', { name: 'Ưu tiên và nguồn' })
    await priority.getByText('Thư có lời đề nghị phản hồi hoặc xác nhận.', { exact: true }).waitFor()
    await priority.getByRole('link', { name: moved.subject, exact: true }).click()
    await page.waitForURL('**/inbox?email=' + moved.id)
    await page.getByText(reason, { exact: false }).first().waitFor()
    record('browser sign-in opens the prioritized schedule change and its source', true)

    step = 'Commitment Intelligence'
    await page.goto(app + '/commitments')
    await page.getByRole('link', { name: /Đề xuất từ email/ }).click()
    const proposal = (mail) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: mail.subject }) })
    const confirmation = page.getByRole('dialog', { name: 'Xác nhận đề xuất' })
    step = 'Cam kết chưa có bản gốc'
    await proposal(moved).getByText('Chưa xác định được cam kết tương ứng do người gửi phụ trách.').waitFor()
    record('a schedule change cannot be confirmed before the original commitment exists',
      await proposal(moved).getByRole('button', { name: 'Xem và xác nhận' }).count() === 0 &&
      (await read('/api/commitments')).items.length === 0)

    step = 'Commitment Intelligence'
    async function approveCommitment(mail, expectedCount, quote) {
      await proposal(mail).getByRole('button', { name: 'Xem và xác nhận' }).click()
      await confirmation.getByText(quote, { exact: true }).waitFor()
      assert.equal((await read('/api/commitments')).items.length, expectedCount)
      const write = page.waitForResponse(response => new URL(response.url()).pathname === '/api/commitments/detections' &&
        response.request().method() === 'POST')
      await confirmation.getByRole('button', { name: 'Xác nhận và ghi vào sổ' }).click()
      assert.ok((await write).ok(), 'Commitment confirmation failed')
      await confirmation.waitFor({ state: 'hidden' })
      await page.getByText(`Đã ghi vào sổ ${expectedCount + 1} đề xuất.`, { exact: true }).waitFor()
    }
    await approveCommitment(original, 0, `Chúng tôi cam kết sẽ ${title} trước ngày ${oldDate}.`)
    const [initial] = (await read('/api/commitments')).items
    assert.equal(initial.state.dueOn, oldDate)
    await approveCommitment(moved, 1, `Chúng tôi dời hạn sang ngày ${newDate}.`)
    const [updated] = (await read('/api/commitments')).items
    assert.equal(updated.id, initial.id)
    assert.equal(updated.version, initial.version + 1)
    assert.equal(updated.state.dueOn, newDate)
    record('both approvals write one versioned commitment with the updated due date', true)

    step = 'Ask Inbox thiếu bằng chứng'
    await page.goto(app + '/search')
    const search = page.getByRole('searchbox', { name: 'Nội dung tìm kiếm' })
    const ask = page.getByRole('button', { name: 'Hỏi email' })
    await search.fill('Đối chiếu ngày giao hàng của PO-999999?')
    await ask.click()
    await page.getByText('Chưa tìm được thư mang đúng mã này trong phạm vi đã chọn.').waitFor()
    record('Ask Inbox abstains on an unknown reference and shows no source links',
      await page.getByRole('link', { name: /^Mở nguồn/ }).count() === 0)

    step = 'Ask Inbox đối chiếu nguồn'
    await page.getByRole('searchbox', { name: 'Câu hỏi về email' }).fill(`Đối chiếu ngày giao hàng của ${reference}?`)
    await ask.click()
    await page.getByText('Có mâu thuẫn giữa các email', { exact: true }).waitFor()
    for (const date of [oldDate, newDate]) {
      await page.getByText(date.split('-').reverse().join('/'), { exact: true }).waitFor()
    }
    const source = mail => page.getByRole('link', { name: 'Mở nguồn · ' + mail.subject, exact: true })
    await source(original).waitFor()
    await source(accounting).waitFor()
    assert.equal(await source(foreign).count(), 0)
    await source(moved).click()
    await page.waitForURL('**/inbox?email=' + moved.id)
    await page.getByText(reason, { exact: false }).first().waitFor()
    record('Ask Inbox cites both accounts and opens the reason in the revised source email', true)

    step = 'Ask Inbox giới hạn một hộp thư'
    await page.goto(app + '/search')
    await search.fill(`Đối chiếu ngày giao hàng của ${reference}?`)
    await page.getByRole('button', { name: /Bộ lọc/ }).click()
    await page.getByRole('checkbox', { name: 'finance@example.test', exact: true }).check()
    await ask.click()
    await source(accounting).waitFor()
    record('Ask Inbox account filter keeps only the finance evidence for the same reference',
      await source(original).count() === 0 && await source(moved).count() === 0 &&
      await page.getByText(oldDate.split('-').reverse().join('/'), { exact: true }).count() === 0)

    const preview = page.getByRole('region', { name: 'Bản xem trước kế hoạch' })
    const approval = page.getByRole('dialog', { name: 'Phê duyệt phạm vi' })
    async function approveArchive({ onlyChangedEmail }) {
      await page.goto(app + '/operator')
      await page.getByRole('textbox', { name: 'Lệnh thao tác' }).fill(`Lưu trữ thư từ ${vendor}`)
      await page.getByLabel('Tài khoản thư', { exact: true }).selectOption(work)
      await page.getByRole('button', { name: 'Xem trước kế hoạch' }).click()
      if (onlyChangedEmail) await preview.getByRole('checkbox', { name: 'Chọn ' + original.subject }).uncheck()
      await preview.getByRole('button', { name: 'Xem lại phạm vi đã chọn' }).click()
      await approval.getByText(moved.subject, { exact: true }).waitFor()
      await approval.getByRole('button', { name: 'Phê duyệt phạm vi này' }).click()
    }

    step = 'AI Operator'
    await approveArchive({ onlyChangedEmail: true })
    const execute = preview.getByRole('button', { name: 'Thực thi 1 thư' })
    await execute.waitFor()
    assert.equal((await readEmail(moved.id)).is_archived, false)
    await execute.click()
    const outcome = page.getByRole('region', { name: 'Xác minh và hoàn tác' })
    await outcome.getByRole('status').filter({ hasText: 'Đã xác minh' }).waitFor()
    const planId = new URL(page.url()).searchParams.get('plan')
    assert.ok(planId)
    await page.reload()
    await outcome.getByRole('status').filter({ hasText: 'Đã xác minh' }).waitFor()
    assert.equal((await readEmail(moved.id)).is_archived, true)
    assert.equal((await readEmail(original.id)).is_archived, false)
    await outcome.getByRole('button', { name: 'Xem trước hoàn tác' }).click()
    await page.getByRole('dialog', { name: 'Xác nhận hoàn tác' }).getByRole('button', { name: 'Hoàn tác phạm vi này' }).click()
    await outcome.getByRole('status').filter({ hasText: 'Đã hoàn tác' }).waitFor()
    assert.equal((await readEmail(moved.id)).is_archived, false)
    record('Operator archives only the approved email, verifies after reload and undoes it', true)

    step = 'AI Operator phát hiện phạm vi đã đổi'
    await approveArchive({ onlyChangedEmail: false })
    const executeBoth = preview.getByRole('button', { name: 'Thực thi 2 thư' })
    await executeBoth.waitFor()
    // Simulate an incoming provider update between approval and execution.
    const changed = await admin.from('emails').update({ subject: `${moved.subject} · Đã cập nhật` })
      .eq('id', moved.id).eq('user_id', moved.user_id).select('id').single()
    assert.equal(changed.error, null)
    const stalePlanId = new URL(page.url()).searchParams.get('plan')
    assert.ok(stalePlanId)
    await executeBoth.click()
    await preview.getByText('Cần lập kế hoạch mới', { exact: true }).waitFor()
    record('Operator rejects the whole approved batch after one email changes',
      (await read('/api/operator/' + stalePlanId)).status === 'stale' &&
      (await readEmail(original.id)).is_archived === false && (await readEmail(moved.id)).is_archived === false)

    step = 'Gửi lại sau khi mất phản hồi'
    await page.goto(app + '/compose')
    await page.getByLabel('Từ', { exact: true }).selectOption(work)
    await page.getByLabel('Đến', { exact: true }).fill(vendor)
    await page.getByLabel('Tiêu đề', { exact: true }).fill(sendSubject)
    await page.getByRole('textbox', { name: 'Nội dung thư' }).fill(`Bên mua xác nhận đã nhận lịch giao mới ${newDate}.`)
    const sendUrl = app + '/api/compose-drafts'
    const draftIds = []
    let accepted
    await page.route(sendUrl, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const command = route.request().postDataJSON()
      if (!['send', 'check'].includes(command.action)) return route.continue()
      draftIds.push(command.id)
      if (draftIds.length > 1) return route.continue()
      const actual = await route.fetch({ maxRetries: 0, maxRedirects: 0 })
      accepted = await actual.json()
      await route.abort('failed')
    })
    await page.getByRole('button', { name: 'Xem trước thư gửi', exact: true }).click()
    await page.getByRole('dialog', { name: 'Xem trước thư gửi' }).getByRole('button', { name: 'Xác nhận gửi' }).click()
    await page.getByText('Mất kết nối. Mở lại bản nháp để kiểm tra trạng thái.', { exact: true }).waitFor()
    assert.equal(accepted?.state, 'accepted')
    assert.equal(smtpWire.state.messages.length, 1)
    const replay = await page.request.post(sendUrl, { data: { action: 'send', id: draftIds[0] } })
    const sent = await replay.json()
    assert.equal(sent.state, 'accepted')
    assert.equal(sent.messageId, accepted.messageId)
    assert.ok(draftIds.length === 1 && draftIds[0])
    await page.getByRole('link', { name: 'Mở thư đã gửi', exact: true }).click()
    await page.waitForURL('**/sent')
    assert.equal(smtpWire.state.messages.length, 1)
    const inbox = await (await loopbackFetch(mailpit + '/api/v1/messages')).json()
    assert.equal(inbox.messages.filter(message => message.Subject === sendSubject &&
      message.To.some(recipient => recipient.Address === vendor)).length, 1)
    record('Compose recovers a lost acceptance response and replay preserves the single SMTP message in Mailpit', true)

    step = 'Cách ly tổ chức'
    await signIn(previousEmail, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await page.getByRole('button', { name: /^Mở thư: Hồ sơ riêng/ }).waitFor()
    assert.equal(await page.getByRole('button', { name: /^Mở thư:/ }).count(), 1)
    await read('/api/emails/' + moved.id, 404)
    await read('/api/operator/' + planId, 404)
    assert.deepEqual(runtimeErrors, [])
    record('a second tenant sees its own inbox and cannot open the buyer email or plan', true)
  } catch (error) {
    await page?.screenshot({ path: `${output}/failure.png`, animations: 'disabled', timeout: 5_000 }).catch(() => {})
    throw new Error(`${step}: ${error.message}`, { cause: error })
  } finally {
    await browser.close()
  }
}
