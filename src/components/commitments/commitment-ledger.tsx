'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, FileText, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { loadCommitmentBoard, loadCommitmentDetail, loadCommitmentDetections, LedgerApiError } from '@/lib/commitments/client'
import {
  commitmentsHref, formatCommitmentDue, groupLabels, isCommitmentGroup,
  ownerLabel, statusLabels, validCommitmentId, type BoardItem, type CommitmentGroup,
} from '@/lib/commitments/view'
import { CommitmentDetail } from './commitment-detail'
import { CommitmentConfirmationDialog } from './commitment-confirmation'
import { CommitmentProposals } from './commitment-proposals'

const groups = Object.entries(groupLabels) as [CommitmentGroup, string][]

function CommitmentRow({ item, group, active }: { item: BoardItem; group: CommitmentGroup; active: boolean }) {
  return (
    <li>
      <Link
        href={commitmentsHref(group, item.id)}
        scroll={false} prefetch={false}
        aria-current={active ? 'location' : undefined}
        data-active={active}
        className="neo-mail-row flex min-w-0 items-start gap-3 px-4 py-4 hover:bg-[var(--hover)] sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-5">{item.state.title}</p>
          <p className="mt-1 break-words text-xs text-[var(--foreground-muted)]">
            {ownerLabel(item.state)}{group === 'overdue' && item.responsibility !== 'unassigned' && (
              <span> · {groupLabels[item.responsibility]}</span>
            )}
          </p>
          {item.state.review && (
            <p className="mt-2 text-xs font-medium text-[var(--warning)]">
              {item.state.review.kind === 'conflicting' ? 'Có nguồn mâu thuẫn' : 'Cần xem xét'}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-xs font-medium tabular-nums', group === 'overdue' ? 'text-[var(--error)]' : 'text-[var(--foreground-secondary)]')}>
            {formatCommitmentDue(item.state)}
          </p>
          {group === 'closed' && <p className="mt-1 text-xs text-[var(--foreground-muted)]">{statusLabels[item.state.status]}</p>}
        </div>
        <ChevronRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--foreground-muted)]" />
      </Link>
    </li>
  )
}

export function CommitmentLedger({ userId }: { userId: string }) {
  const params = useSearchParams()
  const groupParam = params.get('group')
  const group = isCommitmentGroup(groupParam) ? groupParam : 'mine'
  const showProposals = params.get('view') === 'proposals'
  const idParam = params.get('id')
  const id = !showProposals && validCommitmentId(idParam) ? idParam.toLowerCase() : null
  const cache = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id: string; version: number } | null>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const previousId = useRef(id)

  const board = useInfiniteQuery({
    queryKey: ['commitments', userId, 'board', group],
    queryFn: ({ pageParam, signal }) => loadCommitmentBoard(group, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.nextBeforeId,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
    retry: false,
  })
  const detail = useInfiniteQuery({
    queryKey: ['commitments', userId, 'detail', id],
    queryFn: ({ pageParam, signal }) => loadCommitmentDetail(id!, pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: last => last.nextBeforeVersion,
    enabled: id !== null,
    retry: false,
  })
  const detections = useInfiniteQuery({
    queryKey: ['commitments', userId, 'detections'],
    queryFn: ({ pageParam, signal }) => loadCommitmentDetections(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.nextBeforeId,
    staleTime: 30_000,
    refetchInterval: query => (query.state.data?.pages.length ?? 0) < 2 ? 60_000 : false,
    refetchOnWindowFocus: false,
    retry: false,
  })

  useEffect(() => {
    if (previousId.current && !id) listHeading.current?.focus()
    previousId.current = id
  }, [id])

  const head = detail.data?.pages[0]
  const history = detail.data?.pages.flatMap(page => page.history) ?? []
  const items = board.data?.pages.flatMap(page => page.items) ?? []
  const totals = board.data?.pages.at(-1)?.totals
  const proposals = [...new Map(detections.data?.pages.flatMap(page => page.proposals)
    .map(proposal => [proposal.proposalId, proposal])).values()]
  const refresh = () => void cache.invalidateQueries({ queryKey: ['commitments', userId] })
  const reloadDetail = () => {
    setEditingId(null)
    refresh()
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-[var(--canvas)] lg:h-full lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="neo-title" ref={listHeading} tabIndex={-1}>Cam kết</h1>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">Hạn chót theo giờ Việt Nam (UTC+7)</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Link href={commitmentsHref(group) + '&view=proposals'} prefetch={false}
            aria-current={showProposals ? 'page' : undefined}
            className="neo-nav-item neo-nav-inline neo-target gap-2 px-2 text-sm">
            <FileText size={16} aria-hidden="true" /> Đề xuất từ email
            {proposals.some(proposal => proposal.review) && <>
              <span aria-hidden="true" className="size-2 shrink-0 bg-[var(--accent)]" />
              <span className="sr-only">Có đề xuất cần duyệt</span>
            </>}
          </Link>
          <button type="button" onClick={refresh} disabled={board.isFetching || detections.isFetching}
            className="neo-icon-button disabled:opacity-50" aria-label="Làm mới sổ cam kết" title="Làm mới sổ cam kết">
            <RotateCw size={18} aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>
      </header>
      {showProposals ? (
        <CommitmentProposals group={group} proposals={proposals}
          hasMore={detections.hasNextPage} loading={detections.isPending} fetching={detections.isFetching}
          failed={detections.isError} refresh={refresh}
          load={() => { if (detections.isFetchNextPageError || !detections.isError) void detections.fetchNextPage(); else void detections.refetch() }} />
      ) : <>
      <nav aria-label="Nhóm cam kết" className={cn('grid grid-cols-3 gap-x-1 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-5 md:flex md:flex-wrap', id && 'hidden md:hidden lg:flex')}>
        {groups.map(([key, label]) => (
          <Link key={key} href={commitmentsHref(key)} scroll={false} prefetch={false} aria-current={key === group ? 'page' : undefined}
            className="neo-nav-item neo-nav-inline neo-target min-h-11 shrink-0 gap-2 px-2 text-xs sm:px-3 sm:text-sm">
            {label}
            {totals && <span className="tabular-nums text-[var(--foreground-muted)]">{totals[key]}</span>}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]">
        <section aria-label={`Danh sách ${groupLabels[group].toLowerCase()}`}
          className={cn('min-w-0 bg-[var(--surface)] lg:overflow-y-auto lg:border-e lg:border-[var(--border)]', id && 'hidden lg:block')}>
          {board.isPending ? (
            <p role="status" className="p-5 text-sm text-[var(--foreground-muted)]">Đang tải danh sách cam kết…</p>
          ) : board.isError && items.length === 0 ? (
            <EmptyState type="error" title="Chưa tải được sổ cam kết" description="Kiểm tra kết nối rồi thử lại."
              action={{ label: 'Thử tải lại danh sách', onClick: () => void board.refetch() }} />
          ) : items.length > 0 ? (
            <>
              <ul className="divide-y divide-[var(--border)]">
                {items.map(item => <CommitmentRow key={item.id} item={item} group={group} active={id === item.id} />)}
              </ul>
              {(board.hasNextPage || board.isError) && (
                <div className="border-t border-[var(--border)] p-4 text-center">
                  {board.isError && <p role="status" className="mb-2 text-sm text-[var(--error)]">Chưa cập nhật được danh sách.</p>}
                  <Button type="button" variant="outline" loading={board.isFetching}
                    onClick={() => { if (board.isFetchNextPageError || !board.isError) void board.fetchNextPage(); else void board.refetch() }}>
                    {board.isError ? 'Thử tải lại' : 'Tải thêm cam kết'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState type="empty-folder" title="Nhóm này chưa có cam kết"
              description={group === 'unassigned' ? 'Những cam kết chưa xác định email người phụ trách sẽ xuất hiện ở đây.' : 'Các cam kết thuộc nhóm này sẽ xuất hiện ở đây.'} />
          )}
        </section>

        <div className={cn('min-w-0 lg:overflow-y-auto', !id && 'hidden lg:block')}>
          {!id ? (
            <EmptyState icon={<ClipboardList size={24} aria-hidden="true" />} title="Chọn một cam kết"
              description="Xem người phụ trách, hạn chót, lịch sử và email nguồn." />
          ) : detail.isPending ? (
            <p role="status" className="p-6 text-sm text-[var(--foreground-muted)]">Đang tải chi tiết cam kết…</p>
          ) : !head ? (
            <div className="p-5">
              <Link href={commitmentsHref(group)} className="neo-target inline-flex items-center py-2 text-sm text-[var(--accent-foreground)] underline">Về danh sách</Link>
              <EmptyState type="error"
                title={detail.error instanceof LedgerApiError && detail.error.status === 404 ? 'Cam kết không còn khả dụng' : 'Chưa tải được chi tiết'}
                description="Kiểm tra quyền truy cập hoặc thử tải lại."
                action={{ label: 'Thử tải lại chi tiết', onClick: () => void detail.refetch() }} />
            </div>
          ) : (
            <CommitmentDetail key={head.id} detail={head} history={history} group={group}
              savedVersion={saved?.id === id ? saved.version : null}
              onConfirm={() => setEditingId(head.id)}
              hasMore={detail.hasNextPage} loadingMore={detail.isFetching}
              historyError={detail.isError}
              onLoadHistory={() => { if (detail.isFetchNextPageError || !detail.isError) void detail.fetchNextPage(); else void detail.refetch() }}
            />
          )}
        </div>
      </div>
      {editingId && editingId === id && head && (
        <CommitmentConfirmationDialog detail={head} history={history} onClose={() => setEditingId(null)} onReload={reloadDetail}
          onSaved={version => {
            setEditingId(null)
            setSaved({ id: head.id, version })
            refresh()
          }} />
      )}
      </>}
    </div>
  )
}
