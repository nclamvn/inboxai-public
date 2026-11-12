'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Clock, RefreshCw } from 'lucide-react'
import { GmailReconnectButton, GmailReconnectNotice } from '@/components/gmail/gmail-reconnect'
import { ScheduleSendDialog } from '@/components/email/schedule-send-dialog'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { composeRequest, fileDraftHref } from '@/lib/compose/client'
import { ReplyError } from '@/lib/replies/client'
import type { ScheduledMail } from '@/lib/scheduled-mail/contracts'

const states: Record<ScheduledMail['state'], string> = {
  scheduled: 'Đã lên lịch', dispatching: 'Đang xử lý', unknown: 'Đang chờ xác minh Gmail',
  accepted: 'Đã gửi', rejected: 'Gmail từ chối', partial: 'Gửi một phần',
  failed: 'Không gửi được', canceled: 'Đã hủy lịch',
}
const linkClass = 'neo-target inline-flex items-center text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4'
const moment = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))

function change(command: object) {
  return composeRequest<{ state?: string }>('/api/scheduled-mail', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
  })
}

export default function OutboxPage() {
  const [dialog, setDialog] = useState<{ mode: 'move' | 'cancel'; mail: ScheduledMail } | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const checkingRef = useRef(false)
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null)
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['scheduled-mail'],
    staleTime: 0,
    queryFn: ({ signal }) => composeRequest<ScheduledMail[]>('/api/scheduled-mail', { signal }),
    refetchInterval: query => query.state.data?.some(mail =>
      ['scheduled', 'dispatching', 'unknown'].includes(mail.state)) ? 10_000 : false,
  })

  async function check(mail: ScheduledMail) {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(mail.id)
    setFeedback(null)
    try {
      const receipt = await change({ action: 'check', id: mail.id })
      setFeedback({ message: receipt.state === 'accepted' ? 'Đã đối chiếu thư trong Gmail.'
        : 'Gmail chưa có biên nhận xác nhận thư này.' })
    } catch (reason) {
      setFeedback({ error: true, message: reason instanceof ReplyError ? reason.message : 'Chưa kiểm tra được trạng thái.' })
    } finally {
      await refetch()
      setChecking(null)
      checkingRef.current = false
    }
  }

  return <div className="mx-auto min-h-full max-w-5xl bg-[var(--surface)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
      <div><h1 className="neo-title">Chờ gửi</h1>
        <p className="mt-1 text-sm text-[var(--foreground-secondary)]">Lịch gửi và trạng thái xác nhận từ Gmail.</p></div>
      <Button variant="outline" type="button" disabled={isFetching} onClick={() => void refetch()}
        leftIcon={<RefreshCw size={16} aria-hidden="true" />}>Làm mới</Button>
    </header>
    <div className="px-4 sm:px-6"><GmailReconnectNotice /></div>
    {feedback && <div className="px-4 pt-4 sm:px-6">
      {feedback.error ? <Alert variant="error">{feedback.message}</Alert> : <p role="status">{feedback.message}</p>}
    </div>}
    {error && <Alert variant="error" className="mx-4 mt-4 sm:mx-6">Chưa thể tải lịch gửi. Hãy thử làm mới.</Alert>}
    {isPending && <p className="px-4 py-6 sm:px-6" role="status">Đang tải lịch gửi…</p>}
    {data?.length === 0 && <div className="space-y-2 px-4 py-6 sm:px-6">
      <p>Chưa có thư lên lịch.</p><Link href="/compose" className={linkClass}>Soạn thư</Link>
    </div>}
    {data && <ul className="divide-y divide-[var(--border)]">
      {data.map(mail => {
        const draft = mail.draftId ? fileDraftHref(mail.draftId) : mail.sourceId ? '/compose?reply=' + mail.sourceId : null
        return <li key={mail.id} className="px-4 py-4 sm:px-6">
          <article aria-label={mail.subject} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="min-w-0 break-words font-semibold">{mail.subject}</h2>
              <p className="border-s-2 border-[var(--accent)] ps-2 text-sm font-medium">{states[mail.state]}</p>
            </div>
            <dl className="grid gap-1 text-sm text-[var(--foreground-secondary)] sm:grid-cols-2">
              <div className="min-w-0 break-all"><dt className="inline font-medium">Gửi từ </dt><dd className="inline">{mail.account}</dd></div>
              <div className="min-w-0 break-all"><dt className="inline font-medium">Người nhận </dt><dd className="inline">{mail.to.join(', ')}</dd></div>
              {mail.cc.length > 0 && <div className="min-w-0 break-all"><dt className="inline font-medium">Cc </dt><dd className="inline">{mail.cc.join(', ')}</dd></div>}
              <div className="flex items-center gap-2">
                <dt className="sr-only">Giờ gửi theo múi giờ thiết bị</dt>
                <Clock aria-hidden="true" size={15} /><dd><time dateTime={mail.sendAt}>{moment(mail.sendAt)}</time></dd>
              </div>
            </dl>
            {mail.reconnectRequired && <>
              <p className="text-sm text-[var(--foreground-secondary)]">{['failed', 'rejected'].includes(mail.state)
                ? 'Thư chưa được gửi. Hãy kết nối lại Gmail rồi hủy lịch để mở bản nháp.'
                : mail.state === 'unknown' ? 'Cần kết nối lại Gmail để xác minh trạng thái gửi.'
                  : 'Đang chờ kết nối lại Gmail. Lịch đã duyệt sẽ tiếp tục khi có quyền.'}</p>
              <GmailReconnectButton accountId={mail.accountId} email={mail.account} surface="outbox" />
            </>}
            <div className="flex flex-wrap items-center gap-2">
              {mail.state === 'scheduled' && <Button type="button" variant="outline" onClick={() => {
                setFeedback(null); setDialog({ mode: 'move', mail })
              }}>Dời lịch gửi</Button>}
              {['scheduled', 'failed', 'rejected'].includes(mail.state) && <Button type="button" variant="outline" onClick={() => {
                setFeedback(null); setDialog({ mode: 'cancel', mail })
              }}>Hủy lịch gửi</Button>}
              {['unknown', 'dispatching'].includes(mail.state) && <Button type="button" variant="outline"
                disabled={!!checking && checking !== mail.id} loading={checking === mail.id}
                onClick={() => void check(mail)}>Kiểm tra Gmail</Button>}
              {mail.state === 'canceled' && draft && <Link href={draft} className={linkClass}>Mở bản nháp</Link>}
              {mail.sentId && <Link href={'/inbox?email=' + mail.sentId} className={linkClass}>Mở thư đã gửi</Link>}
            </div>
          </article>
        </li>
      })}
    </ul>}
    {dialog && <ScheduleSendDialog mode={dialog.mode} subject={dialog.mail.subject} sendAt={dialog.mail.sendAt}
      onClose={() => setDialog(null)} onSave={async at => {
        try {
          await change({ action: dialog.mode, id: dialog.mail.id, version: dialog.mail.version, ...(at && { at }) })
        } catch (reason) {
          if (reason instanceof ReplyError && reason.status === 409) void refetch()
          throw reason
        }
        setFeedback({ message: dialog.mode === 'cancel' ? 'Đã hủy lịch và giữ bản nháp.' : 'Đã lưu giờ gửi mới.' })
        setDialog(null)
        void refetch()
      }} />}
  </div>
}
