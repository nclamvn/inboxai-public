// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ComposePage from '@/app/(dashboard)/compose/page'

const nav = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}))

const account = { id: '10000000-0000-4000-8000-000000000001', email_address: 'sender@example.test', provider: 'gmail', is_active: true }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const post = vi.fn()
const keyAt = (index: number) => post.mock.calls[index][0].headers['Idempotency-Key']

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  post.mockReset()
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (url === '/api/source-accounts') return json({ accounts: [account] })
    if (url === '/api/emails/send') return post(init)
    throw new Error('Unexpected network call')
  }))
})

afterEach(cleanup)

async function openDraft() {
  render(<ComposePage />)
  await screen.findByText(account.email_address)
  fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'recipient@example.test' } })
  fireEvent.change(screen.getByPlaceholderText('Tiêu đề email'), { target: { value: 'Cam kết giao hàng' } })
}

it('checks a lost response with the same idempotency key across compose remount', async () => {
  post.mockRejectedValueOnce(new Error('synthetic response loss'))
    .mockResolvedValueOnce(json({ state: 'accepted', success: true }))
  await openDraft()
  fireEvent.click(screen.getByRole('button', { name: /^Gửi$/ }))
  await screen.findByText(/Chưa thể xác nhận yêu cầu/)
  expect(nav.push).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Thử lại yêu cầu' })).toBeTruthy()
  expect(sessionStorage.length).toBe(1)
  expect(sessionStorage.key(0)).not.toContain('recipient@example.test')

  cleanup()
  await openDraft()
  fireEvent.click(screen.getByRole('button', { name: /^Gửi$/ }))
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/sent'))
  expect(keyAt(1)).toBe(keyAt(0))
  expect(sessionStorage.length).toBe(0)
})

it('keeps pending status on compose and protects the submitted content from accidental resubmission as a new send', async () => {
  post.mockResolvedValueOnce(json({ state: 'unknown', success: false, error: 'Chưa rõ kết quả' }, 202))
  await openDraft()
  fireEvent.click(screen.getByRole('button', { name: /^Gửi$/ }))
  await screen.findByText('Chưa rõ kết quả')
  expect(nav.push).not.toHaveBeenCalled()
  fireEvent.change(screen.getByPlaceholderText('Tiêu đề email'), { target: { value: 'Edited' } })
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra trạng thái' }))
  await screen.findByText(/Hãy khôi phục nội dung/)
  expect(post).toHaveBeenCalledOnce()
})

it('permits a deliberate new attempt after a definitive rejection', async () => {
  post.mockResolvedValueOnce(json({ state: 'rejected', success: false, error: 'Bị từ chối' }, 422))
    .mockResolvedValueOnce(json({ state: 'accepted', success: true }))
  await openDraft()
  fireEvent.click(screen.getByRole('button', { name: /^Gửi$/ }))
  await screen.findByText('Bị từ chối')
  fireEvent.click(screen.getByRole('button', { name: /^Gửi$/ }))
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/sent'))
  expect(keyAt(0)).not.toBe(keyAt(1))
})
