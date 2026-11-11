'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, ListChecks } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { createOperatorPlan, loadOperatorHistory, loadOperatorPlan, OperatorApiError } from '@/lib/operator/client'
import { operatorActions, type OperatorPlan, type OperatorReceipt } from '@/lib/operator/contracts'
import { OperatorPreview, operatorDate, statusLabels } from './operator-preview'

type Account = { id: string; email_address: string }
const example = 'Lưu trữ thư cũ hơn 30 ngày, trừ thư có tệp đính kèm'
const planHref = (id: string) => '/operator?' + new URLSearchParams({ plan: id })

export function OperatorWorkspace({ userId, accounts, accountsFailed }: {
  userId: string
  accounts: Account[]
  accountsFailed: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('plan')
  const cache = useQueryClient()
  const historyKey = ['operator', userId, 'history']
  const planKey = ['operator', userId, 'plan', id]
  const history = useQuery({
    queryKey: historyKey, queryFn: ({ signal }) => loadOperatorHistory(signal), retry: false,
  })
  const detail = useQuery({
    queryKey: planKey, queryFn: ({ signal }) => loadOperatorPlan(id!, signal), enabled: Boolean(id), retry: false,
  })
  const [command, setCommand] = useState('')
  const [accountId, setAccountId] = useState('')
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<{ input: string; key: string } | null>(null)
  const pending = useRef(false)
  const focusedPlan = useRef<string | null>(null)
  const planHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (detail.data?.id && focusedPlan.current === detail.data.id) {
      planHeading.current?.focus()
      focusedPlan.current = null
    }
  }, [detail.data?.id])

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = command.trim()
    if (pending.current || !text) return
    pending.current = true
    setPlanning(true)
    setError(null)
    const input = JSON.stringify([text, accountId])
    if (request.current?.input !== input) request.current = { input, key: crypto.randomUUID() }
    try {
      const receipt = await createOperatorPlan(text, accountId || null, request.current.key)
      request.current = null
      focusedPlan.current = receipt.id
      void cache.invalidateQueries({ queryKey: historyKey })
      if (id === receipt.id) void detail.refetch()
      else router.push(planHref(receipt.id), { scroll: false })
    } catch (failure) {
      if (failure instanceof OperatorApiError && failure.status >= 400 && failure.status < 500) request.current = null
      setError(failure instanceof Error ? failure.message : 'Chưa lập được kế hoạch.')
    } finally {
      pending.current = false
      setPlanning(false)
    }
  }

  function update(receipt: OperatorReceipt) {
    cache.setQueryData<OperatorPlan>(planKey, current => current && { ...current, ...receipt })
    void cache.invalidateQueries({ queryKey: ['operator', userId] })
  }

  return (
    <div className="min-h-full min-w-0 bg-[var(--canvas)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6"><h1 className="neo-title">AI Operator</h1></div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(250px,1fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="operator-create" className="space-y-3 border-y border-[var(--border)] bg-[var(--surface)] px-4 py-5 sm:px-5">
            <h2 id="operator-create" className="text-base font-semibold">Tạo kế hoạch</h2>
            <p className="text-sm text-[var(--foreground-secondary)]">Lưu trữ hoặc đánh dấu đã đọc theo mốc ngày hoặc địa chỉ người gửi.</p>
            <form onSubmit={prepare} className="space-y-3">
              <label className="block space-y-1 text-sm font-medium">
                <span>Lệnh thao tác</span>
                <textarea required maxLength={240} rows={2} value={command} onChange={event => setCommand(event.target.value)}
                  placeholder={example}
                  className="w-full min-w-0 resize-y rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 py-2 text-base text-[var(--foreground)] sm:text-sm" />
              </label>
              <button type="button" onClick={() => setCommand(example)}
                className="neo-target min-h-11 text-left text-sm text-[var(--accent-foreground)] underline underline-offset-4">Dùng lệnh mẫu</button>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <label htmlFor="operator-account" className="block text-sm font-medium">Tài khoản thư</label>
                  <select id="operator-account" value={accountId} onChange={event => setAccountId(event.target.value)} disabled={accountsFailed}
                    className="min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input)] px-3 text-base text-[var(--foreground)] sm:text-sm">
                    <option value="">Tất cả tài khoản của bạn</option>
                    {accounts.map(account => <option key={account.id} value={account.id}>{account.email_address}</option>)}
                  </select>
                </div>
                <Button type="submit" className="min-h-11 shrink-0" loading={planning} disabled={accountsFailed || !command.trim()}>Xem trước kế hoạch</Button>
              </div>
            </form>
            {accountsFailed && <Alert variant="error" title="Chưa tải được tài khoản">Tải lại trang để chọn phạm vi.</Alert>}
            {error && <Alert variant="error" title="Chưa lập được kế hoạch">{error}</Alert>}
          </section>

          {id && <section aria-labelledby="operator-preview" className="min-w-0 space-y-3">
            <h2 id="operator-preview" ref={planHeading} tabIndex={-1} className="text-base font-semibold">Phạm vi và phê duyệt</h2>
            {detail.isPending && <p role="status" className="text-sm">Đang tải bản xem trước…</p>}
            {detail.isError && <div className="space-y-2">
              <Alert variant="error" title="Chưa tải được kế hoạch">{detail.error.message}</Alert>
              <Button type="button" variant="outline" onClick={() => void detail.refetch()}>Tải lại kế hoạch</Button>
            </div>}
            {detail.data && <OperatorPreview key={detail.data.id} plan={detail.data}
              account={detail.data.spec.accountId ? accounts.find(account => account.id === detail.data?.spec.accountId)?.email_address ?? 'Tài khoản không còn khả dụng' : 'Tất cả tài khoản của bạn'}
              updated={update} refresh={() => void detail.refetch()} />}
          </section>}
        </div>

        <aside aria-labelledby="operator-history" className="min-w-0">
          <h2 id="operator-history" className="mb-3 text-base font-semibold">Kế hoạch gần đây</h2>
          {history.isPending && <p role="status" className="text-sm">Đang tải kế hoạch…</p>}
          {history.isError && <div className="space-y-2">
            <Alert variant="error" title="Chưa tải được lịch sử">{history.error.message}</Alert>
            <Button type="button" variant="outline" onClick={() => void history.refetch()}>Tải lại lịch sử</Button>
          </div>}
          {history.data?.length === 0 && <EmptyState icon={<ListChecks size={24} aria-hidden="true" />} title="Chưa có kế hoạch" />}
          {Boolean(history.data?.length) && <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface)]">
            {history.data?.map(item => (
              <li key={item.id}>
                <Link href={planHref(item.id)} scroll={false} prefetch={false} aria-current={id === item.id ? 'location' : undefined}
                  data-active={id === item.id} className="neo-mail-row flex min-w-0 justify-between gap-2 px-3 py-3 hover:bg-[var(--hover)]">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{operatorActions[item.action]} · {item.targetCount} thư</p>
                    <p className="text-xs text-[var(--foreground-secondary)]">{statusLabels[item.status]}</p>
                    <time dateTime={item.createdAt} className="text-xs tabular-nums text-[var(--foreground-muted)]">{operatorDate(item.createdAt)}</time>
                  </div>
                  <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-[var(--foreground-muted)]" />
                </Link>
              </li>
            ))}
          </ul>}
        </aside>
      </div>
    </div>
  )
}
