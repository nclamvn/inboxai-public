'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ReplyFollowupDialog } from '@/components/replies/reply-followup-dialog'
import { replyHref } from '@/lib/replies/contracts'
import { evidenceRequestContext, type EvidenceRequestContext } from '@/lib/commitments/purchase-evidence-request'

const endpoint = '/api/commitments/evidence-requests'
const link = 'neo-target inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline underline-offset-4'

async function readContext(caseId: string, signal?: AbortSignal) {
  const response = await fetch(endpoint+'?case='+caseId, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Chưa tải được yêu cầu bổ sung.')
  return evidenceRequestContext.parse(await response.json())
}

export function PurchaseEvidenceRequest({ caseId, userId }: { caseId: string; userId: string }) {
  const router = useRouter()
  const cache = useQueryClient()
  const key = ['commitments', userId, 'evidence-request', caseId]
  const context = useQuery({ queryKey: key, queryFn: ({ signal }) => readContext(caseId,signal),
    staleTime: 30_000, refetchOnMount: 'always', refetchInterval: 30_000, retry: false })
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'date' | 'preview' | 'check' | null>(null)
  const request = context.data?.request
  const uncertain = request && ['dispatching','unknown'].includes(request.state)
  const reminderUncertain = request && ['dispatching','unknown'].includes(request.work.reminderState ?? '')

  async function prepare() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }), signal: AbortSignal.timeout(15_000) })
      const result: unknown = await response.json()
      if (!response.ok) {
        setError((result as { error?: string }).error ?? 'Chưa tạo được bản nháp yêu cầu.')
        return
      }
      const next: EvidenceRequestContext = evidenceRequestContext.parse(result)
      cache.setQueryData(key, next)
      if (next.request) router.push(replyHref(next.request.sourceId))
    } catch {
      setError('Chưa xác nhận được kết quả. Thử lại sẽ mở cùng bản nháp đã lưu.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <section aria-label="Yêu cầu và theo dõi chứng từ" className="mt-3 border-t border-[var(--border)] pt-2">
    {context.isPending && <p role="status" className="py-2 text-sm">Đang tải yêu cầu bổ sung…</p>}
    {context.isError && <p role="status" className="text-sm">Chưa tải được yêu cầu bổ sung. <Button type="button" variant="ghost"
      onClick={() => { void context.refetch() }}>Tải lại yêu cầu</Button></p>}
    {request && <>
      <p className="mt-1 text-sm">{context.data?.stage==='reviewer' ? 'Đã bàn giao chứng từ; chờ Kế toán duyệt.'
        : !request.active ? 'Hồ sơ đã thay đổi. Yêu cầu cũ không được gửi thêm.'
        : uncertain ? 'Chưa rõ kết quả gửi. Kiểm tra lượt gửi trước khi tiếp tục.'
        : request.replyId ? 'Đã có hồi đáp; hồ sơ vẫn chờ chứng từ được kiểm tra và duyệt.'
        : request.state==='accepted' ? request.tracking ? 'Đang chờ chứng từ bổ sung.' : 'Đã gửi yêu cầu. Hãy đặt ngày kiểm tra lại.'
        : 'Bản nháp yêu cầu đã lưu. Cần xem trước và xác nhận gửi.'}</p>
      {request.followupOn && <p className="mt-1 text-xs text-[var(--foreground-muted)]">Ngày kiểm tra lại: <time dateTime={request.followupOn}>
        {request.followupOn.split('-').reverse().join('/')}</time></p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link className={link} href={request.state==='accepted' && request.sentId ? '/inbox?email='+request.sentId : replyHref(request.sourceId)} prefetch={false}>
          {uncertain ? 'Kiểm tra yêu cầu đã gửi' : request.state==='accepted' ? 'Mở yêu cầu đã gửi' : 'Tiếp tục bản nháp yêu cầu'}</Link>
        {request.replyId && <Link className={link} href={'/inbox?email='+request.replyId} prefetch={false}>Mở hồi đáp của nhà cung cấp</Link>}
        {request.active && request.state==='accepted' && !request.replyId && !reminderUncertain && <>
          <Button type="button" variant="ghost" onClick={() => setDialog('date')}>{request.followupOn ? 'Dời ngày kiểm tra' : 'Đặt ngày kiểm tra'}</Button>
          {request.work.status==='due' && <Button type="button" variant="outline" onClick={() => setDialog('preview')}>Xem trước thư nhắc chứng từ</Button>}
        </>}
        {reminderUncertain && <Button type="button" variant="outline" onClick={() => setDialog('check')}>Kiểm tra thư nhắc chứng từ</Button>}
        {request.work.reminderState==='accepted' && <p className="text-xs text-[var(--foreground-muted)]">Đã gửi thư nhắc cho ngày hẹn này.</p>}
      </div>
    </>}
    {context.data?.canRequest && (!request || request.canContinue || !request.active) && <Button type="button" variant="outline"
      className="my-1" loading={busy} onClick={() => { void prepare() }}>{request ? 'Soạn yêu cầu bổ sung tiếp' : 'Soạn yêu cầu gửi nhà cung cấp'}</Button>}
    {error && <p role="alert" className="mt-2 text-sm text-[var(--error)]">{error}</p>}
    {dialog && request && <ReplyFollowupDialog item={request.work} mode={dialog} onClose={() => setDialog(null)}
      onChange={() => { void context.refetch(); void cache.invalidateQueries({ queryKey: ['reply-work', userId] }) }} />}
  </section>
}
