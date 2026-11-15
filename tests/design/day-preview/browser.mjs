import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { audit } from '../browser.mjs'

const require = createRequire(import.meta.url)
const axeScript = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

async function auditGuide(page) {
  // Evaluate through the browser driver. The guide keeps its no-inline-script CSP.
  await page.evaluate(axeScript)
  return audit(page)
}

export async function rehearseDayPreview({ guide, app, base, email, password, output, record, smtpWire }) {
  const browser = await chromium.launch(process.env.INBOXAI_CHROMIUM_PATH
    ? { executablePath: process.env.INBOXAI_CHROMIUM_PATH } : { channel: 'chrome' })
  mkdirSync(output, { recursive: true })
  const { corpus, accounts, main, appJson } = guide.seed
  let product
  try {
    const context = await browser.newContext({ locale: 'vi-VN', serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
    await context.grantPermissions(['local-network-access'], { origin: app })
    await context.addInitScript(() => localStorage.setItem('inboxai_onboarding_seen', 'true'))
    await context.route('**/*', route => [guide.origin, app, base].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    const page = await context.newPage()
    const errors = []
    context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)))
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(guide.origin)
    const launch = page.getByRole('link', { name: 'Mở InboxAI', exact: true })
    await launch.waitFor()
    assert.deepEqual(await auditGuide(page), [])
    await page.screenshot({ path: output + '/guide.png', animations: 'disabled', fullPage: true })
    const config = await (await page.request.get(guide.origin + '/config')).json()
    const headers = { Origin: guide.origin, 'X-Demo-Token': config.token }
    assert.equal((await page.request.post(guide.origin + '/advance/1')).status(), 403)
    assert.equal((await page.request.post(guide.origin + '/advance/1', { headers })).status(), 409)
    record('guide opens on desktop, blocks unauthenticated controls and starts with later mail locked', true)

    const opening = page.waitForEvent('popup')
    await launch.click()
    product = await opening
    await product.waitForLoadState('networkidle')
    await product.getByLabel('Email', { exact: true }).fill(email)
    await product.getByLabel('Mật khẩu', { exact: true }).fill(password)
    assert.equal(await product.getByLabel('Email', { exact: true }).inputValue(), email)
    await product.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await product.waitForURL(app + '/inbox')
    const row = product.getByRole('region', { name: 'Cam kết cần chú ý' }).getByRole('listitem').filter({ hasText: corpus.title })
    await row.getByText(/Quá hạn/).waitFor()
    await product.screenshot({ path: output + '/inbox.png', animations: 'disabled' })
    await row.getByRole('link', { name: 'Mở email nguồn', exact: true }).click()
    await product.waitForURL('**/inbox?email=' + guide.seed.messages.get('a1').id)
    await product.goto(app + '/inbox')
    await row.getByRole('button', { name: 'Xem trước lời nhắc', exact: true }).click()
    const preview = product.getByRole('dialog', { name: 'Xem trước lời nhắc' })
    await preview.getByText(corpus.vendor, { exact: true }).waitFor()
    const before = smtpWire.state.messages.length
    await preview.getByRole('button', { name: 'Xác nhận và gửi lời nhắc' }).click()
    await preview.getByText('Đã gửi lời nhắc', { exact: true }).waitFor()
    assert.equal(smtpWire.state.messages.length, before + 1)
    record('opening the linked product tab, signing in and approving the morning reminder works with local SMTP', true)

    async function advance(label, nextLink) {
      await page.bringToFront()
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.getByRole('link', { name: nextLink, exact: true }).waitFor()
    }
    async function follow(name) {
      await page.bringToFront()
      const link = page.getByRole('link', { name, exact: true })
      const url = await link.getAttribute('href')
      await link.click()
      await product.waitForURL(url)
    }
    await advance('Nạp phản hồi chưa chốt', 'Mở phản hồi cần kiểm tra')
    assert.equal((await page.request.post(guide.origin + '/advance/1', { headers })).status(), 200)
    await follow('Mở phản hồi cần kiểm tra')
    await product.getByText('Người phụ trách chưa xác nhận lịch. Cam kết giữ nguyên hạn đã duyệt.').waitFor()
    assert.equal(await product.getByRole('button', { name: 'Xem và xác nhận', exact: true }).count(), 0)
    assert.equal((await appJson('/api/commitments/' + main.id)).state.dueOn, corpus.oldDue)
    record('injecting the same staged reply twice is idempotent and uncertainty is displayed without revising the ledger', true)

    await advance('Nạp lịch đã chốt', 'Đối chiếu trong Ask Inbox')
    await follow('Đối chiếu trong Ask Inbox')
    await product.getByText('Có mâu thuẫn giữa các email', { exact: true }).waitFor()
    await product.getByRole('link', { name: 'Mở nguồn · Xác nhận lô ống dẫn [VT-78416]', exact: true }).waitFor()
    await product.getByRole('link', { name: 'Mở nguồn · Đối chiếu lịch giao [VT-78416]', exact: true }).waitFor()
    await product.screenshot({ path: output + '/ask.png', animations: 'disabled' })
    const confirm = async name => {
      await follow(name)
      await product.getByRole('button', { name: 'Xem và xác nhận', exact: true }).click()
      await product.getByRole('dialog', { name: 'Xác nhận đề xuất' })
        .getByRole('button', { name: 'Xác nhận và ghi vào sổ', exact: true }).click()
      await product.getByText('Đã ghi vào sổ 1 đề xuất.', { exact: true }).waitFor()
    }
    await confirm('Duyệt đề xuất đổi hạn')
    assert.equal((await appJson('/api/commitments/' + main.id)).state.dueOn, corpus.newDue)
    record('Ask Inbox compares work and finance sources before the supplier deadline is approved', true)

    await advance('Nạp thư kho ký nhận', 'Duyệt hoàn tất')
    await confirm('Duyệt hoàn tất')
    await follow('Mở lịch sử đã khép')
    await product.getByRole('heading', { name: 'Lịch sử', exact: true }).waitFor()
    const ledger = await appJson('/api/commitments/' + main.id)
    assert.equal(ledger.version, 3)
    assert.equal(ledger.state.status, 'completed')
    assert.equal(ledger.history[0].sources[0].emailId, guide.seed.messages.get('a4').id)

    await follow('Mở AI Operator')
    await product.getByRole('textbox', { name: 'Lệnh thao tác' }).fill('Lưu trữ thư từ dispatch@broker.example.test')
    await product.getByLabel('Tài khoản thư', { exact: true }).selectOption(accounts.finance)
    await product.getByRole('button', { name: 'Xem trước kế hoạch' }).click()
    const operator = product.getByRole('region', { name: 'Bản xem trước kế hoạch' })
    await operator.getByRole('checkbox', { name: 'Chọn Re: Lịch xe [VT-78416]', exact: true }).waitFor()
    await operator.getByRole('button', { name: 'Xem lại phạm vi đã chọn' }).click()
    await product.getByRole('dialog', { name: 'Phê duyệt phạm vi' }).getByRole('button', { name: 'Phê duyệt phạm vi này' }).click()
    await operator.getByRole('button', { name: 'Thực thi 1 thư' }).click()
    const outcome = product.getByRole('region', { name: 'Xác minh và hoàn tác' })
    await outcome.getByRole('status').filter({ hasText: 'Đã xác minh' }).waitFor()
    await product.screenshot({ path: output + '/operator.png', animations: 'disabled' })
    await outcome.getByRole('button', { name: 'Xem trước hoàn tác' }).click()
    await product.getByRole('dialog', { name: 'Xác nhận hoàn tác' }).getByRole('button', { name: 'Hoàn tác phạm vi này' }).click()
    await outcome.getByRole('status').filter({ hasText: 'Đã hoàn tác' }).waitFor()
    assert.equal(context.pages().length, 2)
    assert.equal(smtpWire.state.messages.length, before + 1)
    assert.deepEqual(errors, [])
    record('the closed ledger preserves evidence and AI Operator verifies and undoes the scoped archive', true)

    const mobile = await context.newPage()
    await mobile.setViewportSize({ width: 390, height: 844 })
    await mobile.goto(guide.origin)
    await mobile.getByRole('heading', { name: 'Một ngày trong InboxAI' }).waitFor()
    await mobile.getByRole('link', { name: 'Mở InboxAI', exact: true }).waitFor()
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(await auditGuide(mobile), [])
    await mobile.screenshot({ path: output + '/guide-mobile.png', animations: 'disabled', fullPage: true })
    record('the guide fits mobile width and passes sampled accessibility checks', true)
  } catch (error) {
    await product?.screenshot({ path: output + '/failure.png' }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
}
