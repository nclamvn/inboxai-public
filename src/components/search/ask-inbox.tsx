'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Bookmark, ChevronDown, FileText, Search } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { AskHit, AskResults } from '@/lib/search/ask-contracts'

type Account = { id: string; email_address: string }
const inputClass = 'min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 text-base text-[var(--foreground)] sm:text-sm'
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' })
const citationLabels = {
  subject: 'Tiêu đề', body_text: 'Nội dung thư', snippet: 'Đoạn xem trước', from_address: 'Địa chỉ người gửi', from_name: 'Tên người gửi',
}

function Citation({ hit }: { hit: AskHit }) {
  const subject = hit.subject?.trim() || '(Không có tiêu đề)'
  const at = hit.at ? Date.parse(hit.at) : NaN
  return (
    <li className="min-w-0 space-y-2 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0 text-sm font-semibold leading-6">
          <Link href={'/inbox?email=' + hit.id} prefetch={false}
            aria-label={'Mở email nguồn · ' + subject}
            className="neo-target inline-flex items-center gap-2 text-[var(--accent-foreground)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-current">
            <FileText size={16} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{subject}</span>
          </Link>
        </h3>
        {Number.isFinite(at) && <time dateTime={hit.at!} className="text-xs tabular-nums text-[var(--foreground-muted)]">{dateFormat.format(at)}</time>}
      </div>
      <p className="break-words text-xs text-[var(--foreground-secondary)] [overflow-wrap:anywhere]">
        {hit.senderName ? hit.senderName + ' · ' : ''}{hit.sender}
        <span className="text-[var(--foreground-muted)]"> · {hit.account ?? 'Thư chưa gắn tài khoản'}</span>
      </p>
      {hit.citation.quote && (
        <figure className="border-s-2 border-[var(--accent)] ps-3">
          <figcaption className="mb-1 text-xs text-[var(--foreground-muted)]">{citationLabels[hit.citation.field]}</figcaption>
          <blockquote className="whitespace-pre-line break-words text-sm leading-6 [overflow-wrap:anywhere]">{hit.citation.quote}</blockquote>
        </figure>
      )}
      <p className="text-xs text-[var(--foreground-muted)]">
        {hit.keyword && hit.semantic ? 'Từ khóa và ngữ nghĩa' : hit.keyword ? 'Từ khóa' : hit.semantic ? 'Ngữ nghĩa' : 'Bộ lọc'}
      </p>
    </li>
  )
}

async function findEmails(filters: object, signal: AbortSignal): Promise<AskResults> {
  const response = await fetch('/api/ask-inbox', {
    method: 'POST', body: JSON.stringify(filters), headers: { 'Content-Type': 'application/json' },
    cache: 'no-store', signal,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Chưa tìm được thư.')
  return data
}

export function AskInbox({ userId, accounts, accountsFailed }: { userId: string; accounts: Account[]; accountsFailed: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const query = params.get('q') ?? ''
  const accountIds = params.getAll('account')
  const sender = params.get('sender') ?? ''
  const from = params.get('from') ?? ''
  const until = params.get('until') ?? ''
  const attachment = params.get('attachment') === '1'
  const filterCount = Number(Boolean(accountIds.length)) + Number(Boolean(sender)) + Number(Boolean(from || until)) + Number(attachment)
  const started = Boolean(query.trim() || filterCount)
  const key = params.toString()
  const results = useQuery({
    queryKey: ['ask-inbox', userId, key],
    queryFn: ({ signal }) => findEmails({
      query, accountIds, sender, from: from || undefined, until: until || undefined, attachment,
    }, signal),
    enabled: started, retry: false, staleTime: 0, gcTime: 120_000, refetchOnWindowFocus: false,
  })
  const [more, setMore] = useState({ key: '', count: 12 })
  const [save, setSave] = useState({ key: '', state: '' })
  const [filterPanel, setFilterPanel] = useState<{ key: string; open: boolean } | null>(null)
  const panelId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const requested = useRef<string | null>(null)
  const shown = more.key === key ? more.count : 12
  const result = results.data
  const hasUnindexed = Boolean(result?.coverage && result.coverage.indexed < result.coverage.eligible)
  const saveState = save.key === key ? save.state : ''
  const filtersOpen = filterPanel?.key === key ? filterPanel.open : filterCount > 0

  useEffect(() => {
    if (requested.current === key && !results.isFetching && !results.isPending) {
      heading.current?.focus()
      requested.current = null
    }
  }, [key, results.isFetching, results.isPending])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    const text = String(form.get('q') ?? '').trim()
    if (text) next.set('q', text)
    for (const id of form.getAll('account')) next.append('account', String(id))
    for (const field of ['sender', 'from', 'until']) {
      const value = String(form.get(field) ?? '').trim()
      if (value) next.set(field, value)
    }
    if (form.has('attachment')) next.set('attachment', '1')
    setMore({ key: next.toString(), count: 12 })
    requested.current = next.size ? next.toString() : null
    if (next.toString() === key) {
      if (next.size) void results.refetch()
    }
    else router.push(next.size ? '/search?' + next.toString() : '/search', { scroll: false })
    if (text) {
      void fetch('/api/search/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }),
      }).catch(() => {})
    }
  }

  async function saveQuery() {
    setSave({ key, state: 'Đang lưu…' })
    try {
      const response = await fetch('/api/search/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, save: true }),
      })
      if (!response.ok) throw new Error('Save failed')
      setSave({ key, state: 'Đã lưu cụm tìm kiếm.' })
    } catch {
      setSave({ key, state: 'Chưa lưu được cụm tìm kiếm.' })
    }
  }

  return (
    <div className="min-h-full min-w-0 bg-[var(--canvas)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <h1 className="neo-title">Ask Inbox</h1>
          <form key={key} onSubmit={search} role="search" aria-label="Ask Inbox" className="mt-4 space-y-3">
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 space-y-1 text-sm font-medium">
                <span>Nội dung tìm kiếm</span>
                <input name="q" type="search" maxLength={300} defaultValue={query} className={inputClass}
                  placeholder="Ví dụ: Nhà cung cấp dời lịch giao hàng" />
              </label>
              <Button type="submit" className="min-h-11 shrink-0" leftIcon={<Search size={16} aria-hidden="true" />}>Tìm thư</Button>
            </div>
            <div className="border-b border-[var(--border)]">
              <button type="button" aria-expanded={filtersOpen} aria-controls={panelId}
                onClick={() => setFilterPanel({ key, open: !filtersOpen })}
                className="neo-target flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent-foreground)]">
                <ChevronDown size={16} aria-hidden="true" className={filtersOpen ? 'shrink-0 rotate-180' : 'shrink-0'} />
                Bộ lọc{filterCount > 0 && <span className="tabular-nums">({filterCount})</span>}
              </button>
              <div id={panelId} hidden={!filtersOpen} className="pb-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium">
                    <span>Người gửi</span>
                    <input name="sender" maxLength={120} defaultValue={sender} placeholder="Tên hoặc địa chỉ email" className={inputClass} />
                  </label>
                  <label className="neo-target flex min-h-11 items-center gap-2 self-end text-sm">
                    <input name="attachment" type="checkbox" defaultChecked={attachment} className="size-4 accent-[var(--primary)]" /> Có tệp đính kèm
                  </label>
                  <label className="min-w-0 space-y-1 text-sm font-medium">
                    <span>Từ ngày</span><input name="from" type="date" defaultValue={from} className={inputClass} />
                  </label>
                  <label className="min-w-0 space-y-1 text-sm font-medium">
                    <span>Đến ngày</span><input name="until" type="date" defaultValue={until} className={inputClass} />
                  </label>
                </div>
                <fieldset className="mt-4 min-w-0">
                  <legend className="text-sm font-medium">Tài khoản thư</legend>
                  {accountsFailed && <p className="mt-1 text-sm text-[var(--error)]">Chưa tải được danh sách tài khoản.</p>}
                  {accounts.length ? (
                    <>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">Để trống để tìm trong tất cả hộp thư của bạn.</p>
                      <div className="grid sm:grid-cols-2">
                        {accounts.map(account => (
                          <label key={account.id} className="neo-target flex min-h-11 min-w-0 items-center gap-2 pr-2 text-sm">
                            <input name="account" value={account.id} defaultChecked={accountIds.includes(account.id)}
                              type="checkbox" className="size-4 shrink-0 accent-[var(--primary)]" />
                            <span className="min-w-0 break-all">{account.email_address}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : !accountsFailed && <p className="mt-1 text-xs text-[var(--foreground-muted)]">Chưa có tài khoản thư được liên kết.</p>}
                </fieldset>
                {started && <Link href="/search" className="neo-target mt-2 inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline">Xóa tìm kiếm và bộ lọc</Link>}
              </div>
            </div>
          </form>
        </div>
      </header>

      <section aria-labelledby="ask-results" className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 ref={heading} id="ask-results" tabIndex={-1} className="text-base font-semibold">Email nguồn</h2>
          {query && result && <Button type="button" variant="ghost" size="sm" onClick={() => void saveQuery()}
            disabled={saveState === 'Đang lưu…'} leftIcon={<Bookmark size={16} aria-hidden="true" />}>
            Lưu cụm tìm kiếm
          </Button>}
        </div>
        {saveState && <p role="status" className="text-sm">{saveState}</p>}
        {!started && <EmptyState type="no-results" title="Tìm trong hộp thư của bạn" description="Nhập nội dung bạn nhớ, hoặc chọn tài khoản, người gửi và khoảng ngày." />}
        {started && results.isPending && <p role="status" className="py-5 text-sm text-[var(--foreground-muted)]">Đang tìm và đối chiếu nguồn…</p>}
        {results.isError && <div className="my-4 space-y-3">
          <Alert variant="error" title="Chưa tải được kết quả">{results.error.message}</Alert>
          <Button type="button" variant="outline" onClick={() => void results.refetch()}>Thử lại</Button>
        </div>}
        {result && <>
          <div className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--foreground-secondary)]">
            <p role="status">{results.isFetching ? 'Đang cập nhật nguồn…' : 'Hiển thị ' + Math.min(shown, result.hits.length) + ' thư phù hợp'}</p>
            {hasUnindexed && <Button type="button" variant="outline" size="sm" loading={results.isFetching} onClick={() => void results.refetch()}>
              Phân tích thêm thư
            </Button>}
          </div>
          {result.coverage && (hasUnindexed || result.coverage.capped) && <p className="mb-3 text-xs text-[var(--foreground-muted)]">
            Đã lập chỉ mục ngữ nghĩa {result.coverage.indexed}/{result.coverage.eligible} thư{result.coverage.capped ? ' mới nhất trong phạm vi lọc' : ' trong phạm vi lọc'}.
          </p>}
          {(result.semantic === 'unavailable' || result.semantic === 'busy') && <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--foreground-secondary)]">
            <p>{result.semantic === 'busy' ? 'Đang có lượt phân tích ngữ nghĩa. Hiện hiển thị kết quả từ khóa.' : 'Ngữ nghĩa chưa khả dụng. Hiện hiển thị kết quả từ khóa.'}</p>
            <Button type="button" variant="outline" size="sm" loading={results.isFetching} onClick={() => void results.refetch()}>Thử lại ngữ nghĩa</Button>
          </div>}
          {result.hits.length ? (
            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface)]">
              {result.hits.slice(0, shown).map(hit => <Citation key={hit.id} hit={hit} />)}
            </ul>
          ) : <EmptyState type="no-results" title="Chưa tìm thấy email phù hợp" description="Thử đổi cách diễn đạt hoặc mở rộng bộ lọc." />}
          {shown < result.hits.length && <Button type="button" variant="outline" className="mt-4" onClick={() => setMore({ key, count: shown + 12 })}>Xem thêm kết quả</Button>}
          {result.hits.length === 50 && <p className="mt-3 text-xs text-[var(--foreground-muted)]">Đã lấy 50 kết quả đầu. Thu hẹp bộ lọc để tìm chính xác hơn.</p>}
        </>}
      </section>
    </div>
  )
}
