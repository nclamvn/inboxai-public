// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InboxLanes } from '@/components/email/inbox-lanes'
import { isDestinationActive, primaryDestinations } from '@/components/layout/navigation'

afterEach(cleanup)
it('matches nested pillar routes without treating mail search as Ask Inbox', () => {
  expect(primaryDestinations.map(item=>item.href)).toEqual(['/inbox','/commitments','/search','/operator'])
  expect(isDestinationActive('/commitments/living','/commitments')).toBe(true)
  expect(isDestinationActive('/commitments-other','/commitments')).toBe(false)
  expect(isDestinationActive('/search/mail','/search')).toBe(false)
  expect(isDestinationActive('/search','/search')).toBe(true)
})
it('keeps loaded counts explicit and delegates filters and density without a mail mutation', () => {
  const onChange=vi.fn(),onDensityChange=vi.fn()
  render(<InboxLanes current="transaction" counts={{all:50,transaction:3,needs_action:2}} hasMore dense={false} onChange={onChange} onDensityChange={onDensityChange} />)
  expect(screen.getByLabelText('3 thư đã tải, còn trang chưa tải').textContent).toBe('3+')
  expect(screen.getByRole('button',{name:/Giao dịch/}).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:/Cần xử lý/}))
  expect(onChange).toHaveBeenCalledWith('needs_action')
  fireEvent.click(screen.getByRole('button',{name:'Hiển thị gọn'}))
  expect(onDensityChange).toHaveBeenCalledWith(true)
  expect(screen.getByRole('button',{name:'Hiển thị thoáng'}).getAttribute('aria-pressed')).toBe('true')
})
