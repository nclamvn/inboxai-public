'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function GmailReconnectButton({ accountId, email, surface }: {
  accountId: string
  email: string
  surface: 'inbox' | 'outbox'
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const label = surface === 'outbox' ? 'Kết nối lại Gmail để gửi' : 'Kết nối lại Gmail'

  async function reconnect() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(false)
    try {
      const result = await fetch('/api/source-accounts/' + encodeURIComponent(accountId) + '/reconnect?surface=' + surface, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
      })
      if (!result.ok) throw new Error('OAuth unavailable')
      const { auth_url } = await result.json()
      const destination = new URL(auth_url)
      if (destination.origin !== 'https://accounts.google.com') throw new Error('Invalid OAuth destination')
      window.location.assign(destination.href)
    } catch {
      setError(true)
      setBusy(false)
      pending.current = false
    }
  }

  return <div className="py-1">
    <Button type="button" variant="outline" size="sm" className="min-h-11" loading={busy}
      aria-label={label + ' cho ' + email} onClick={() => void reconnect()}>{label}</Button>
    {error && <p role="alert" className="mt-1 text-sm text-[var(--error)]">Chưa thể mở kết nối Gmail. Hãy thử lại.</p>}
  </div>
}

export function GmailReconnectNotice() {
  const result = useSearchParams().get('gmail_reconnect')
  if (!result) return null
  if (result === 'connected') return <p role="status" className="py-2 text-sm">Đã kết nối lại Gmail. InboxAI sẽ tiếp tục đồng bộ thư.</p>
  const message = result === 'account_mismatch' ? 'Bạn đã chọn nhầm tài khoản Gmail. Hãy kết nối lại bằng đúng địa chỉ đã hiển thị.'
    : result === 'denied' ? 'Bạn đã hủy cấp quyền Gmail.'
    : result === 'scope_missing' ? 'Gmail chưa cấp đủ quyền cần thiết. Hãy kiểm tra các quyền khi kết nối lại.'
    : 'Chưa thể kết nối lại Gmail. Hãy mở lại yêu cầu từ tài khoản cần kết nối.'
  return <p role="alert" className="py-2 text-sm text-[var(--error)]">{message}</p>
}
