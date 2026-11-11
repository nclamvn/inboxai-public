// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SignupPage from '@/app/(auth)/signup/page'
afterEach(cleanup)

async function fillSignup(result: object) {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ allowed:true, message:'Xác minh email để tiếp tục' })))
    .mockResolvedValueOnce(new Response(JSON.stringify(result), { status:202 })))
  render(<SignupPage />)
  fireEvent.change(screen.getByLabelText('Email'), { target:{ value:'synthetic@example.test' } })
  fireEvent.click(screen.getByRole('button', { name:'Tiếp tục' }))
  await screen.findByRole('button', { name:'Tạo tài khoản' })
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target:{ value:'Synthetic User' } })
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target:{ value:'Synthetic-passphrase-123' } })
  fireEvent.click(screen.getByRole('button', { name:'Tạo tài khoản' }))
}
it('shows verification instructions rather than immediate-login success', async () => {
  await fillSignup({ success:true, requires_email_verification:true, message:'Vui lòng xác minh email trước khi đăng nhập.' })
  expect(await screen.findByText('Kiểm tra email xác minh')).toBeTruthy()
  expect(screen.queryByText('Đăng nhập ngay')).toBeNull()
  expect(screen.getByText('Vui lòng xác minh email trước khi đăng nhập.')).toBeTruthy()
})
it('does not claim signup success without the verification contract', async () => {
  await fillSignup({ success:true })
  expect(await screen.findByText('Không thể xác nhận yêu cầu đăng ký. Vui lòng thử lại sau.')).toBeTruthy()
  expect(screen.queryByText('Kiểm tra email xác minh')).toBeNull()
})
