'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Alert } from '@/components/ui/alert'
import { confirmCommitmentDetection, LedgerApiError } from '@/lib/commitments/client'
import { commitmentChanges, commitmentsHref, formatCommitmentDue, formatCommitmentMoment, ownerLabel, statusLabels, type CommitmentGroup } from '@/lib/commitments/view'
import type { CommitmentProposal } from '@/lib/commitments/detection'

const labels: Record<CommitmentProposal['kind'], string> = {
  create: 'Cam kết mới', deadline: 'Đổi hạn chót', owner: 'Đổi người phụ trách',
  completed: 'Hoàn tất', cancelled: 'Hủy cam kết',
}

function Source({ proposal }: { proposal: CommitmentProposal }) {
  return (
    <div className="min-w-0 space-y-2">
      <blockquote className="whitespace-pre-wrap break-words border-s-2 border-[var(--accent)] ps-3 text-sm leading-6">
        {proposal.quote}
      </blockquote>
      <Link href={'/inbox?email=' + proposal.emailId} prefetch={false}
        className="neo-target inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)] underline underline-offset-4">
        <FileText size={16} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 break-words">Mở email nguồn{proposal.subject ? ' · ' + proposal.subject : ''}</span>
      </Link>
      <p className="break-all text-xs text-[var(--foreground-muted)]">
        {proposal.sender}{proposal.at ? ' · ' + formatCommitmentMoment(proposal.at) : ''}
      </p>
    </div>
  )
}

function ProposalReview({ proposal, close, refresh, saved }: {
  proposal: CommitmentProposal
  close: () => void
  refresh: () => void
  saved: () => void
}) {
  const [key] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null)
  const pending = useRef(false)
  const review = proposal.review!
  const { state } = review.command
  const changes = proposal.previous ? commitmentChanges(proposal.previous, state) : []

  function dismiss() {
    if (pending.current) return
    if (failure) refresh()
    close()
  }

  async function approve() {
    if (pending.current || failure?.retry === false) return
    pending.current = true
    setBusy(true)
    setFailure(null)
    try {
      const result = await confirmCommitmentDetection(key, review.command)
      if (!result.id || !Number.isInteger(result.version)) throw new Error('Invalid receipt')
      saved()
    } catch (error) {
      const known = error instanceof LedgerApiError && error.status < 500
      setFailure(known
        ? { message: 'Đề xuất hoặc email nguồn đã thay đổi. Tải lại để kiểm tra trước khi xác nhận.', retry: false }
        : { message: 'Chưa xác nhận được kết quả lưu. Có thể thử lại cùng yêu cầu.', retry: true })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal open title="Xác nhận đề xuất" description={review.title} size="lg" onClose={dismiss}
      showCloseButton={!busy} closeOnEscape={!busy} closeOnOverlayClick={false}
      footer={<>
        <Button type="button" variant="ghost" disabled={busy} onClick={dismiss}>
          {failure?.retry ? 'Đóng và kiểm tra' : 'Đóng'}
        </Button>
        {failure?.retry === false
          ? <Button type="button" onClick={dismiss}>Tải lại đề xuất</Button>
          : <Button type="button" loading={busy} onClick={() => void approve()}>
            {failure?.retry ? 'Thử lưu lại' : 'Xác nhận và ghi vào sổ'}
          </Button>}
      </>}>
      <div className="space-y-5">
        <Source proposal={proposal} />
        <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
          {changes.length ? changes.map(change => (
            <div key={change.field} className="space-y-1 py-3">
              <dt className="font-medium">{change.field}</dt>
              <dd className="break-words text-[var(--foreground-secondary)]">Trước đây · {change.from}</dd>
              <dd className="break-words">Đề xuất · {change.to}</dd>
            </div>
          )) : [['Người phụ trách', ownerLabel(state)], ['Hạn chót', formatCommitmentDue(state)], ['Trạng thái', statusLabels[state.status]]].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(112px,1fr)_2fr] gap-3 py-3">
              <dt className="text-[var(--foreground-secondary)]">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {failure && <Alert variant="error" title="Chưa ghi được vào sổ">{failure.message}</Alert>}
      </div>
    </Modal>
  )
}

export function CommitmentProposals({ group, proposals, hasMore, loading, fetching, failed, load, refresh }: {
  group: CommitmentGroup
  proposals: CommitmentProposal[]
  hasMore: boolean
  loading: boolean
  fetching: boolean
  failed: boolean
  load: () => void
  refresh: () => void
}) {
  const [reviewing, setReviewing] = useState<CommitmentProposal | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const receipt = useRef<HTMLParagraphElement>(null)
  const visible = proposals.filter(proposal => !accepted.has(proposal.emailId))
    .sort((a, b) => Number(Boolean(b.review)) - Number(Boolean(a.review)))

  useEffect(() => { receipt.current?.focus() }, [accepted.size])

  return (
    <section aria-labelledby="commitment-proposal-heading" className="min-h-0 min-w-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <Link href={commitmentsHref(group)} className="neo-target inline-flex items-center gap-2 text-sm text-[var(--accent-foreground)]">
          <ArrowLeft size={16} aria-hidden="true" /> Về sổ cam kết
        </Link>
        <h2 id="commitment-proposal-heading" className="neo-title mt-3">Đề xuất từ email</h2>
        {accepted.size > 0 && <p role="status" ref={receipt} tabIndex={-1} className="mt-2 text-sm">Đã ghi vào sổ {accepted.size} đề xuất.</p>}
        {loading && <p role="status" className="py-5 text-sm text-[var(--foreground-muted)]">Đang kiểm tra email…</p>}
        {failed && <div className="my-4"><Alert variant="error" title="Chưa kiểm tra được email">Hãy thử tải lại.</Alert></div>}
        {!loading && !failed && visible.length === 0 && (
          <EmptyState icon={<FileText size={24} aria-hidden="true" />} title={hasMore ? 'Chưa thấy đề xuất trong các thư đã kiểm tra' : 'Chưa có đề xuất để duyệt'}
            description={hasMore ? 'Có thể kiểm tra thêm email cũ hơn.' : undefined} />
        )}
        {visible.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface)]">
            {visible.map(proposal => (
              <li key={proposal.emailId} className="min-w-0 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-[var(--foreground-secondary)]">
                      {labels[proposal.kind]}{proposal.reference ? ' · ' + proposal.reference : ''}
                    </p>
                    {proposal.review?.title && <h3 className="break-words text-sm font-semibold">{proposal.review.title}</h3>}
                  </div>
                  {proposal.review && (
                    <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setReviewing(proposal)}>
                      Xem và xác nhận
                    </Button>
                  )}
                </div>
                <div className="mt-3"><Source proposal={proposal} /></div>
                {proposal.blocked && (
                  <p className="mt-2 text-sm text-[var(--foreground-secondary)]">
                    {proposal.blocked === 'unmatched'
                      ? 'Chưa xác định được cam kết tương ứng trong sổ.'
                      : 'Chưa xác minh được thư này mới hơn bằng chứng đang có trong sổ.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {(hasMore || failed) && (
          <div className="mt-4">
            <Button type="button" variant="outline" loading={fetching} onClick={load}>
              {failed ? 'Thử tải lại đề xuất' : 'Kiểm tra thêm email'}
            </Button>
          </div>
        )}
      </div>
      {reviewing && (
        <ProposalReview proposal={reviewing} close={() => setReviewing(null)} refresh={refresh}
          saved={() => {
            setAccepted(previous => new Set(previous).add(reviewing.emailId))
            setReviewing(null)
            refresh()
          }} />
      )}
    </section>
  )
}
