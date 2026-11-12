'use client'

import { useRef, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Download, FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatFileSize } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { MailCategoryLabel, mailCategoryLabels } from '@/components/email/mail-category-label'
import {
  lookupCategories, lookupCategory, lookupQueryLimit, mailLookupHref, mailLookupParams, readMailLookup,
  type MailLookupCursor, type MailLookupFilters, type MailLookupHit, type MailLookupPage,
} from '@/lib/search/mail-lookup'

const inputClass = 'min-h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 text-base text-[var(--foreground)] sm:text-sm'
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' })

async function findMail(filters: MailLookupFilters, before: MailLookupCursor | null, signal: AbortSignal): Promise<MailLookupPage> {
  if (!navigator.onLine) throw new Error('Mất kết nối. Kết nối lại rồi thử tìm kiếm.')
  const response = await fetch('/api/mail-lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...filters, before }), signal, cache: 'no-store',
  }).catch(error => {
    if (signal.aborted) throw error
    throw new Error('Chưa kết nối được với tìm kiếm. Bạn có thể thử lại.')
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) {
    throw new Error(typeof result?.error === 'string' ? result.error : 'Chưa tải được kết quả tìm kiếm.')
  }
  return result
}

function SearchHit({ hit, queryString }: { hit: MailLookupHit; queryString: string }) {
  const subject = hit.subject?.trim() || '(Không có tiêu đề)'
  const date = new Date(hit.at)
  const source = '/inbox?' + new URLSearchParams({ email: hit.id, lookup: queryString }).toString()
  return (
    <li className="min-w-0 space-y-2 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
          <Link href={source} prefetch={false}
            className="neo-target inline-flex min-h-10 items-center gap-2 text-[var(--accent-foreground)] underline underline-offset-4">
            <FileText size={16} aria-hidden="true" className="shrink-0" />{subject}
          </Link>
        </h3>
        {Number.isFinite(date.valueOf()) && <time dateTime={hit.at} className="text-xs tabular-nums text-[var(--foreground-muted)]">{dateFormat.format(date)}</time>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--foreground-secondary)]">
        <span className="[overflow-wrap:anywhere]">{hit.senderName ? hit.senderName + ' · ' : ''}{hit.sender}</span>
        <span className="font-medium [overflow-wrap:anywhere]">{hit.account ?? 'Thư chưa gắn tài khoản'}</span>
        {hit.direction === 'outbound' && <span>Đã gửi</span>}
        <MailCategoryLabel category={hit.category} />
      </div>
      {hit.preview && <p className="line-clamp-2 text-sm leading-5 text-[var(--foreground-secondary)] [overflow-wrap:anywhere]">{hit.preview}</p>}
      {hit.files.length > 0 && <ul aria-label="Tệp đính kèm" className="flex flex-wrap gap-x-2 gap-y-1 pt-1">
        {hit.files.map(file => <li key={file.id} className="min-w-0 max-w-full">
          <a href={'/api/attachments/' + encodeURIComponent(file.id)} download
            aria-label={`Tải ${file.name}`}
            className="neo-target inline-flex min-h-11 max-w-full items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--accent-foreground)] hover:bg-[var(--hover)]">
            <Download size={15} aria-hidden="true" className="shrink-0" />
            <span className="[overflow-wrap:anywhere]">{file.name}</span>
            {file.size != null && file.size >= 0 && <span className="shrink-0 text-[var(--foreground-muted)]">{formatFileSize(file.size)}</span>}
          </a>
        </li>)}
      </ul>}
      {hit.moreFiles && <Link href={source} prefetch={false}
        className="neo-target inline-flex min-h-11 items-center text-xs text-[var(--accent-foreground)] underline">Mở thư để xem thêm tệp</Link>}
    </li>
  )
}

export function MailLookup({ userId, accounts, accountsFailed }: {
  userId: string
  accounts: { id: string; email_address: string }[]
  accountsFailed: boolean
}) {
  const params = useSearchParams()
  const filters = readMailLookup(params)
  const queryString = mailLookupParams(filters).toString()
  const filtered = Boolean(filters.accounts.length || filters.category || filters.hasFile)
  const started = Boolean(filters.query || filtered)
  const result = useInfiniteQuery({
    queryKey: ['mail-lookup', userId, queryString],
    queryFn: ({ signal, pageParam }) => findMail(filters, pageParam, signal),
    initialPageParam: null as MailLookupCursor | null,
    getNextPageParam: page => page.next,
    enabled: started, retry: false, networkMode: 'always',
    staleTime: 0, gcTime: 120_000, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  const field = useRef<HTMLInputElement>(null)
  const hits = [...new Map(result.data?.pages.flatMap(page => page.hits).map(hit => [hit.id, hit])).values()]

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next: MailLookupFilters = {
      query: String(form.get('q') ?? ''),
      accounts: form.getAll('account').map(String),
      category: lookupCategory(String(form.get('category') ?? '')),
      hasFile: form.has('file'),
    }
    if (mailLookupParams(next).toString() === queryString) {
      if (started) void result.refetch()
    } else {
      window.history.pushState(null, '', mailLookupHref(next))
      requestAnimationFrame(() => field.current?.focus({ preventScroll: true }))
    }
  }

  const ask = new URLSearchParams()
  if (filters.query) ask.set('q', filters.query)
  for (const account of filters.accounts) ask.append('account', account)

  return (
    <section className="mx-auto w-full min-w-0 max-w-4xl space-y-4 px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="neo-title">Tìm thư và tệp</h1>
        <Link href={ask.size ? '/search?' + ask.toString() : '/search'} prefetch={false}
          className="neo-target inline-flex min-h-11 items-center text-sm text-[var(--accent-foreground)] underline underline-offset-4">Mở Ask Inbox</Link>
      </div>
      <form key={queryString} role="search" aria-label="Tìm thư và tệp" onSubmit={submit}
        className="space-y-3 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <input ref={field} type="search" name="q" aria-label="Tìm thư hoặc tên tệp" defaultValue={filters.query}
            maxLength={lookupQueryLimit} placeholder="Tên tệp, người gửi hoặc tiêu đề" className={inputClass + ' flex-1'} />
          <Button type="submit" leftIcon={<Search size={16} aria-hidden="true" />}>Tìm</Button>
        </div>
        <details open={filtered || undefined} className="border-t border-[var(--border)] pt-1 text-sm">
          <summary className="neo-target min-h-11 cursor-pointer py-3 font-medium">Bộ lọc</summary>
          <div className="grid gap-4 pb-2 sm:grid-cols-2">
            <fieldset className="min-w-0">
              <legend className="font-medium">Tài khoản</legend>
              {accountsFailed && <p className="mt-2 text-[var(--error)]">Chưa tải được danh sách tài khoản.</p>}
              {accounts.map(account => <label key={account.id} className="neo-target flex min-h-11 items-center gap-2">
                <input name="account" type="checkbox" value={account.id} defaultChecked={filters.accounts.includes(account.id)}
                  className="size-4 shrink-0 accent-[var(--primary)]" />
                <span className="[overflow-wrap:anywhere]">{account.email_address}</span>
              </label>)}
              {!accountsFailed && accounts.length === 0 && <p className="mt-2 text-[var(--foreground-muted)]">Chưa có tài khoản thư được liên kết.</p>}
            </fieldset>
            <div className="space-y-2">
              <label htmlFor="mail-lookup-category" className="block font-medium">Nhãn</label>
              <select id="mail-lookup-category" name="category" defaultValue={filters.category ?? ''} className={inputClass + ' w-full'}>
                <option value="">Tất cả nhãn</option>
                {lookupCategories.map(category => <option key={category} value={category}>{mailCategoryLabels[category]}</option>)}
              </select>
              <label className="neo-target flex min-h-11 items-center gap-2">
                <input type="checkbox" name="file" defaultChecked={filters.hasFile} className="size-4 shrink-0 accent-[var(--primary)]" />
                Có tệp đính kèm
              </label>
            </div>
          </div>
        </details>
      </form>

      {started && result.isPending && <p role="status" className="text-sm text-[var(--foreground-muted)]">Đang tìm thư…</p>}
      {started && result.isError && <div className="flex flex-wrap items-center gap-3 border border-[var(--border)] bg-[var(--surface)] p-3">
        <p role="alert" className="text-sm text-[var(--error)]">{result.error.message}</p>
        <Button type="button" variant="outline" disabled={result.isFetching}
          onClick={() => void (result.isFetchNextPageError ? result.fetchNextPage() : result.refetch())}>Thử tìm lại</Button>
      </div>}
      {started && result.isSuccess && hits.length === 0 && <EmptyState type="no-results" />}
      {hits.length > 0 && <section aria-label="Kết quả tìm kiếm" className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)]">
        <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold" aria-live="polite">
          {hits.length}{result.hasNextPage ? '+' : ''} thư
        </h2>
        <ol className="divide-y divide-[var(--border)]">{hits.map(hit => <SearchHit key={hit.id} hit={hit} queryString={queryString} />)}</ol>
        {result.hasNextPage && !result.isFetchNextPageError && <div className="border-t border-[var(--border)] px-4 py-3">
          <Button type="button" variant="outline" loading={result.isFetchingNextPage} disabled={result.isFetching}
            onClick={() => void result.fetchNextPage()}>Tải thêm kết quả</Button>
        </div>}
      </section>}
    </section>
  )
}
