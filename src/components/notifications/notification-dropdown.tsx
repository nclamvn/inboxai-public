'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarClock, FileText, Mail, PlugZap } from 'lucide-react'
import { GmailReconnectButton } from '@/components/gmail/gmail-reconnect'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { createClient } from '@/lib/supabase/client'
import { actionNotificationsKey, type ActionNotification } from '@/lib/notifications/action-contracts'

const path = '/api/notifications/action'
const types = {
  reconnect: { label: 'Kết nối Gmail', icon: PlugZap, tone: 'text-[var(--error)]', action: '' },
  'commitment-change': { label: 'Cam kết cần xác nhận', icon: FileText, tone: 'text-[var(--accent-foreground)]', action: 'Xem thay đổi cam kết' },
  'commitment-due': { label: 'Cam kết cần xử lý', icon: CalendarClock, tone: 'text-[var(--accent-foreground)]', action: 'Mở cam kết' },
  reply: { label: 'Có hồi đáp', icon: Mail, tone: 'text-[var(--accent-foreground)]', action: 'Mở thư hồi đáp' },
  followup: { label: 'Đến hẹn theo dõi', icon: CalendarClock, tone: 'text-[var(--accent-foreground)]', action: 'Mở lịch theo dõi' },
}

export function NotificationDropdown({ owner }: { owner: string }) {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const requestPending = useRef(false)
  const cache = useQueryClient()
  const router = useRouter()
  const query = useQuery({
    queryKey: [...actionNotificationsKey, owner],
    enabled: available && (open || ready),
    queryFn: async ({ signal }) => {
      const response = await fetch(path, { signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Notifications unavailable')
      const data: { owner: string; items: ActionNotification[] } = await response.json()
      if (data.owner !== owner) throw new Error('Notification session changed')
      return data.items
    },
    refetchOnMount: 'always', refetchOnReconnect: 'always', refetchOnWindowFocus: 'always',
    refetchInterval: open ? 60_000 : false, retry: false, staleTime: 0,
  })
  const items = available ? query.data ?? [] : []
  const unread = items.filter(item => !item.seenAt).length

  useEffect(() => {
    // Let the Inbox render first. Opening the bell requests the list immediately.
    const afterInbox = window.setTimeout(() => setReady(true), 1500)
    return () => window.clearTimeout(afterInbox)
  }, [])

  useEffect(() => {
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || session?.user.id !== owner && event === 'SIGNED_IN') {
        setAvailable(false)
        setOpen(false)
        cache.removeQueries({ queryKey: [...actionNotificationsKey, owner] })
      }
    })
    return () => subscription.unsubscribe()
  }, [cache, owner])

  async function view(item: ActionNotification, href?: string) {
    if (requestPending.current) return
    setFailed(false)
    if (!item.seenAt) {
      requestPending.current = true
      setPending(item.id)
      try {
        const response = await fetch(path, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }), signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error('View receipt unavailable')
        cache.setQueryData<ActionNotification[]>([...actionNotificationsKey, owner], current => current?.map(row =>
          row.id === item.id ? { ...row, seenAt: new Date().toISOString() } : row))
        void query.refetch()
      } catch {
        setFailed(true)
        void query.refetch()
        return
      } finally {
        requestPending.current = false
        setPending(null)
      }
    }
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  function sourceLink(item: ActionNotification, href: string, label: string) {
    return <Link href={href} prefetch={false} className="neo-target inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4"
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        void view(item, href)
      }}>{label}</Link>
  }

  return <>
    <button type="button" aria-label="Thông báo cần hành động" title="Thông báo cần hành động"
      aria-haspopup="dialog" aria-expanded={open} disabled={!available}
      aria-description={unread ? `${unread} thông báo chưa xem` : undefined}
      className="neo-icon-button relative" onClick={() => {
        setFailed(false)
        setOpen(true)
        if (ready) void query.refetch()
      }}>
      <Bell size={20} strokeWidth={1.5} aria-hidden="true" />
      {unread > 0 && <span aria-hidden="true" className="absolute end-1 top-1 size-2 bg-[var(--accent)]" />}
    </button>
    <Modal open={open && available} title="Thông báo cần hành động" size="xl" onClose={() => setOpen(false)}>
      {query.isPending && query.fetchStatus === 'fetching' && <p role="status" className="py-4 text-sm">Đang tải thông báo…</p>}
      {(query.isError || query.fetchStatus === 'paused') && <Alert variant="warning" title="Chưa làm mới được thông báo">
        Kiểm tra kết nối rồi <button type="button" className="neo-target inline-flex min-h-11 items-center underline" onClick={() => void query.refetch()}>thử lại</button>.
      </Alert>}
      {failed && <Alert variant="warning" title="Chưa xác nhận được trạng thái đã xem">
        Khi có kết nối, danh sách sẽ kiểm tra lại. Bạn có thể đánh dấu lại mục này.
      </Alert>}
      {query.isSuccess && items.length === 0 && <p className="py-4 text-sm text-[var(--foreground-secondary)]">Không có việc cần xử lý.</p>}
      {items.length > 0 && <ul aria-label="Việc cần xử lý" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {items.map(item => {
          const type = types[item.kind]
          const Icon = type.icon
          return <li key={item.id} className="flex min-w-0 gap-3 py-3">
            <Icon size={18} strokeWidth={1.5} aria-hidden="true" className={'mt-0.5 shrink-0 ' + type.tone} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                <p className={'font-medium ' + type.tone}>{type.label}</p>
                <p className="text-[var(--foreground-secondary)]">{item.seenAt ? 'Đã xem' : 'Chưa xem'} · Cần xử lý</p>
              </div>
              <h3 className="mt-1 break-words text-sm font-semibold">{item.title}</h3>
              {item.account && <p className="mt-1 break-words text-xs text-[var(--foreground-secondary)]">{item.account}</p>}
              {item.detail && <p className="mt-2 line-clamp-2 break-words text-sm text-[var(--foreground-secondary)]">{item.detail}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-4">
                {item.href && sourceLink(item, item.href, type.action)}
                {item.followupId && sourceLink(item, '/inbox?followup=' + item.followupId + '#followup-' + item.followupId, 'Mở theo dõi')}
                {item.sourceId && item.kind !== 'reply' && sourceLink(item, '/inbox?email=' + item.sourceId, 'Mở email nguồn')}
                {item.accountId && item.account && <GmailReconnectButton accountId={item.accountId} email={item.account} surface="inbox" />}
                {!item.seenAt && <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={pending !== null}
                  loading={pending === item.id} onClick={() => void view(item)}>Đánh dấu đã xem</Button>}
              </div>
            </div>
          </li>
        })}
      </ul>}
    </Modal>
  </>
}
