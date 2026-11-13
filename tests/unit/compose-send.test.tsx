// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createHash, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ComposePage from '@/app/(dashboard)/compose/page'

const nav = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), useSearchParams: () => nav.params }))
vi.mock('@/components/ui/modal', () => ({
  Modal: ({ open, title, children, footer }: {
    open: boolean; title: string; children: React.ReactNode; footer: React.ReactNode
  }) => open ? <section role="dialog" aria-label={title}>{children}{footer}</section> : null,
}))

const accountId = '10000000-0000-4000-8000-000000000001'
const draftId = '20000000-0000-4000-8000-000000000001'
const account = { id: accountId, email_address: 'sender@example.test', provider: 'gmail', is_active: true }
const fields = { to: 'recipient@example.test', cc: '', subject: 'Cam kết giao hàng', body: '' }
const draft = { id: draftId, sourceId: null, accountId, revision: 1, files: [], fields, state: 'draft' }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const post = vi.fn()
const readDraft = vi.fn()

beforeEach(() => {
  nav.params = new URLSearchParams()
  window.history.replaceState(null, '', '/compose')
  sessionStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (url === '/api/source-accounts') return json({ accounts: [account] })
    if (url === '/api/compose-drafts') return init?.method === 'POST' ? post(JSON.parse(init.body)) : json([])
    if (url === '/api/compose-drafts?id=' + draftId) return readDraft()
    if (url === '/api/emails/send?check=1') return json({ state: 'accepted' })
    throw new Error('Unexpected network call')
  }))
})

afterEach(() => { cleanup(); vi.clearAllMocks(); post.mockReset(); readDraft.mockReset() })

async function preview() {
  render(<ComposePage />)
  await screen.findByText(account.email_address)
  fireEvent.change(screen.getByLabelText('Đến', { exact: true }), { target: { value: fields.to } })
  fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: fields.subject } })
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước thư gửi' }))
  const dialog = await screen.findByRole('dialog', { name: 'Xem trước thư gửi' })
  return within(dialog).getByRole('button', { name: 'Xác nhận gửi' })
}

it('uses the saved identity and recipients for approval and restores an uncertain send by draft ID', async () => {
  post.mockResolvedValueOnce(json(draft)).mockResolvedValueOnce(json({ ...draft, state: 'prepared' }))
    .mockRejectedValueOnce(new Error('synthetic lost response')).mockResolvedValueOnce(json({ state: 'accepted' }))
  readDraft.mockResolvedValueOnce(json({ ...draft, state: 'unknown' })).mockResolvedValueOnce(json({ ...draft, state: 'unknown' }))
  const approve = await preview()
  expect(post).toHaveBeenCalledTimes(1)
  expect(post).toHaveBeenCalledWith({ action: 'save', id: null, revision: null, sourceId: null, accountId, fields, fileIds: [], clientId: expect.any(String) })
  fireEvent.click(approve)
  await screen.findByText('Đang chờ xác minh')
  expect(nav.push).not.toHaveBeenCalled()
  cleanup()
  nav.params.set('draft', draftId)
  render(<ComposePage />)
  const check = await screen.findByRole('button', { name: 'Kiểm tra trạng thái gửi' })
  expect((screen.getByLabelText('Đến') as HTMLInputElement).value).toBe(fields.to)
  expect((screen.getByLabelText('Từ') as HTMLSelectElement).value).toBe(accountId)
  fireEvent.click(check)
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/sent'))
  expect(post.mock.calls.slice(1).map(call => call[0])).toEqual([
    { action: 'prepare', id: draftId, revision: 1 }, { action: 'send', id: draftId }, { action: 'check', id: draftId },
  ])
})

it('keeps a successful HTTP 202 response in verification and does not navigate to Sent', async () => {
  post.mockResolvedValueOnce(json(draft)).mockResolvedValueOnce(json({ ...draft, state: 'prepared' }))
    .mockResolvedValueOnce(json({ state: 'unknown', error: 'Chưa rõ kết quả' }, 202))
  readDraft.mockResolvedValueOnce(json({ ...draft, state: 'unknown' }))
  fireEvent.click(await preview())
  await screen.findByText('Chưa rõ kết quả')
  expect(nav.push).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Kiểm tra trạng thái gửi' })).toBeTruthy()
})

it('checks an old composer receipt without creating a new draft or dispatching again', async () => {
  const payload = JSON.stringify({ sourceAccountId: accountId, to: [fields.to], subject: fields.subject, text: fields.body, cc: [] })
  const key = 'inboxai-send-v1:' + createHash('sha256').update(payload).digest('hex')
  sessionStorage.setItem(key, 'legacy-send-key')
  render(<ComposePage />)
  await screen.findByText(account.email_address)
  fireEvent.change(screen.getByLabelText('Đến', { exact: true }), { target: { value: fields.to } })
  fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: fields.subject } })
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước thư gửi' }))
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/sent'))
  expect(fetch).toHaveBeenCalledWith('/api/emails/send?check=1', expect.objectContaining({ body: payload,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'legacy-send-key' } }))
  expect(post).not.toHaveBeenCalled()
  expect(sessionStorage.getItem(key)).toBeNull()
})
