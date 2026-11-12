'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send, X, Loader2, ListChecks, ChevronDown, FilePenLine, FileText, Minus, Plus, Briefcase, Smile } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ReplyCompose } from '@/components/replies/reply-compose'
import { ComposeFiles, ComposeFileList } from '@/components/email/compose-files'
import { Modal } from '@/components/ui/modal'
import { ScheduleSendDialog } from '@/components/email/schedule-send-dialog'
import { composeDraftAction, fileDraftHref } from '@/lib/compose/client'
import { useFileCompose } from '@/lib/compose/use-file-compose'
import { Alert } from '@/components/ui/alert'
import { composeFingerprint, readComposeKey, saveComposeKey } from '@/lib/mail-send/compose-key'
import { gmailSendPermissionRequired } from '@/lib/gmail/scopes'

interface SourceAccount {
  id: string
  email_address: string
  display_name?: string
  provider: string
  is_active: boolean
}

export default function ComposePage() {
  const params = useSearchParams()
  const source = params.get('reply') ?? params.get('replyToEmailId')
  return source ? <ReplyCompose key={source} source={source} /> : <NewCompose />
}

function NewCompose() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const draftId = searchParams.get('draft')
  const forwardId = searchParams.get('forward')
  const [showCc, setShowCc] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendAction, setSendAction] = useState<'send' | 'retry' | 'check'>('send')
  const sendBusy = useRef(false)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsGmailPermission, setNeedsGmailPermission] = useState(false)
  const [isFromAI, setIsFromAI] = useState(false)

  // Account selection
  const [accounts, setAccounts] = useState<SourceAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const fileCompose = useFileCompose(draftId, forwardId, (fields, account) => {
    setTo(fields.to)
    setCc(fields.cc)
    setShowCc(!!fields.cc)
    setSubject(fields.subject)
    setBody(fields.body)
    if (account) setSelectedAccountId(account)
  })
  const { draft, files, preview } = fileCompose
  const sourceId = draft ? draft.sourceId : forwardId
  const forward = !!sourceId
  const state = draft?.state ?? 'draft'
  const durable = !!(draftId || forward || draft || files.length)
  const locked = fileCompose.loading || fileCompose.blocked || fileCompose.busy || state !== 'draft'
  const fields = { to, cc, subject, body }
  const canSave = !!selectedAccountId && accounts.some(account => account.id === selectedAccountId)
    && !locked && !fileCompose.fileBusy && !loading && !attempt.current
  const changed = draft && (selectedAccountId !== draft.accountId ||
    (Object.keys(fields) as (keyof typeof fields)[]).some(key => fields[key] !== draft.fields[key]) ||
    files.length !== draft.files.length || files.some((file, index) => file.id !== draft.files[index]?.id))
  const status = { draft: changed ? 'Có thay đổi chưa lưu' : draft ? 'Bản nháp đã lưu' : '', prepared: 'Đã lưu yêu cầu gửi', unknown: 'Đang chờ xác minh',
    dispatching: 'Đang chờ xác minh', accepted: 'Đã gửi', partial: 'Chấp nhận một phần', rejected: 'Yêu cầu bị từ chối' }[state]

  // AI Compose
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const [aiPrompt, setAIPrompt] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiAction, setAIAction] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // AI Compose handler
  const handleAIAction = async (action: string, prompt?: string) => {
    if (action !== 'write' && !body.trim()) {
      return // Need content for non-write actions
    }

    setAILoading(true)
    setAIAction(action)

    try {
      const response = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          prompt: action === 'write' ? prompt : undefined,
          currentText: action !== 'write' ? body : undefined,
          subject,
          recipientName: to.split('@')[0],
        }),
      })

      const result = await response.json()

      if (result.success && result.text) {
        setBody(result.text)
        setIsFromAI(true)
        setShowAIPrompt(false)
        setAIPrompt('')
      }
    } catch (error) {
      console.error('AI compose error:', error)
    } finally {
      setAILoading(false)
      setAIAction(null)
    }
  }

  const handleAIWrite = () => {
    if (aiPrompt.trim()) {
      handleAIAction('write', aiPrompt)
    }
  }

  // Fetch source accounts
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch('/api/source-accounts')
        if (res.ok) {
          const data = await res.json()
          const activeAccounts = (data.accounts || []).filter((a: SourceAccount) => a.is_active)
          setAccounts(activeAccounts)
          setSelectedAccountId(current =>
            current || activeAccounts[0]?.id || '',
          )
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error)
      } finally {
        setLoadingAccounts(false)
      }
    }
    fetchAccounts()
  }, [])

  // Pre-fill form from query params (used by AI Reply Assistant)
  useEffect(() => {
    if (draftId || forwardId) return
    const replyTo = searchParams.get('replyTo')
    const subjectParam = searchParams.get('subject')
    const bodyParam = searchParams.get('body')

    if (replyTo) setTo(replyTo)
    if (subjectParam) setSubject(subjectParam)
    if (bodyParam) {
      setBody(bodyParam)
      setIsFromAI(true)
    }
  }, [searchParams, draftId, forwardId])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sendBusy.current || locked || fileCompose.fileBusy) return
    setError(null)
    setNeedsGmailPermission(false)

    if (!to.trim() || !subject.trim()) {
      setError('Vui lòng điền đầy đủ thông tin người nhận và tiêu đề.')
      return
    }

    if (!selectedAccountId) {
      setError('Vui lòng chọn tài khoản gửi.')
      return
    }

    if (durable) {
      if (canSave) await fileCompose.save(fields, selectedAccountId, true)
      return
    }

    sendBusy.current = true
    setLoading(true)

    try {
      const recipients = (value: string) => value.split(',').map(email => email.trim()).filter(Boolean)
      const data = JSON.stringify({
        sourceAccountId: selectedAccountId,
        to: recipients(to),
        subject,
        text: body,
        cc: recipients(cc),
        replyToEmailId: searchParams.get('replyToEmailId') || undefined,
      })
      const fingerprint = await composeFingerprint(data)
      if (attempt.current && attempt.current.fingerprint !== fingerprint) {
        setError('Hãy khôi phục nội dung của lần gửi trước để kiểm tra kết quả.')
        return
      }
      const key = attempt.current?.key ?? readComposeKey(fingerprint) ?? crypto.randomUUID()
      attempt.current = { fingerprint, key }
      saveComposeKey(fingerprint, key)
      setSendAction(action => action === 'check' ? action : 'retry')
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: data,
      })
      const result = await response.json()

      const permissionRequired = result.code === gmailSendPermissionRequired
      if (permissionRequired) setNeedsGmailPermission(true)
      if (permissionRequired || result.state === 'rejected' || [400, 404, 413].includes(response.status)) {
        attempt.current = null
        saveComposeKey(fingerprint, null)
        setSendAction('send')
      }
      if (['dispatching', 'unknown', 'partial'].includes(result.state)) setSendAction('check')
      if (!response.ok || result.success !== true) {
        setError(result.error || 'Chưa thể xác nhận yêu cầu. Hãy kiểm tra lại.')
        return
      }

      saveComposeKey(fingerprint, null)
      router.push('/sent')
    } catch {
      setError('Chưa thể xác nhận yêu cầu. Hãy kiểm tra lại trạng thái với cùng nội dung.')
    } finally {
      sendBusy.current = false
      setLoading(false)
    }
  }

  const handleDiscard = () => {
    if ((!draft && (to || subject || body || files.length)) || changed) {
      if (confirm('Bạn có chắc muốn hủy email này?')) {
        router.back()
      }
    } else {
      router.back()
    }
  }

  const scopePreview = preview && <>
    <dl className="space-y-2 break-words text-sm">
      <div><dt className="font-semibold">Gửi từ</dt><dd>{accounts.find(account => account.id === preview.accountId)?.email_address}</dd></div>
      <div><dt className="font-semibold">Người nhận</dt><dd>{preview.fields.to}</dd></div>
      {preview.fields.cc && <div><dt className="font-semibold">Cc</dt><dd>{preview.fields.cc}</dd></div>}
    </dl>
    <div className="mt-4"><ComposeFileList files={preview.files} sourceFiles={fileCompose.sourceFiles} /></div>
    <p className="mt-4 whitespace-pre-wrap break-words border-t border-[var(--border)] pt-4 text-sm">{preview.fields.body}</p>
  </>

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col border-x border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--border)] bg-[var(--card)]">
        <h1 className="neo-title">{forward ? 'Chuyển tiếp thư' : 'Soạn thư mới'}</h1>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/outbox" className="neo-target inline-flex items-center text-sm underline md:hidden">Chờ gửi</Link>
          <button
            type="button" onClick={handleDiscard} aria-label="Đóng soạn thư"
            className="neo-icon-button"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {!draftId && !forward && fileCompose.entries.length > 0 && <nav aria-label="Bản nháp đã lưu"
        className="space-y-2 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">Bản nháp đã lưu</h2>
        <ul className="flex flex-wrap gap-x-4">
          {fileCompose.entries.map(entry => <li key={entry.id}><a href={fileDraftHref(entry.id)}
            className="neo-target inline-flex items-center break-all text-sm underline">{entry.subject || 'Thư chưa có tiêu đề'}</a></li>)}
        </ul>
      </nav>}
      {/* Form */}
      <form onSubmit={handleSend} className="flex-1 flex flex-col">
        {(error || fileCompose.error) && (
          <Alert variant="error" className="mx-4 mt-4">
            {error || fileCompose.error}
            {fileCompose.blocked && <Button type="button" variant="outline" className="ml-2" onClick={fileCompose.reopen}>Mở lại bản nháp</Button>}
            {(needsGmailPermission || fileCompose.permission) && <a href="/settings#email-accounts" target="_blank" rel="noopener noreferrer"
              className="ml-2 inline-flex min-h-11 items-center underline">Mở Cài đặt tài khoản</a>}
          </Alert>
        )}

        {fileCompose.loading && <p role="status" className="px-4 py-2">Đang mở bản nháp…</p>}
        {status && <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <p role="status" className="text-sm text-[var(--foreground-secondary)]">{draft?.scheduledId ? 'Thư đã lên lịch' : status}</p>
          {draft?.scheduledId && <Link href="/outbox" className="neo-target inline-flex items-center underline">Mở mục Chờ gửi</Link>}
          {!draft?.scheduledId && (state === 'prepared' || state === 'unknown' || state === 'dispatching') &&
            <Button type="button" loading={fileCompose.busy} onClick={() => void fileCompose.send('check')}>Kiểm tra trạng thái gửi</Button>}
          {!draft?.scheduledId && state === 'prepared' && <Button type="button" variant="outline" disabled={fileCompose.busy}
            onClick={() => void fileCompose.send('send')}>Tiếp tục gửi thư đã duyệt</Button>}
          {!draft?.scheduledId && (state === 'prepared' || state === 'rejected') && <Button type="button" variant="ghost" disabled={fileCompose.busy}
            onClick={() => void fileCompose.change('edit')}>Mở lại bản nháp để chỉnh sửa</Button>}
          {(state === 'accepted' || state === 'partial') && <a href="/sent" className="neo-target inline-flex items-center underline">Mở thư đã gửi</a>}
        </div>}
        <fieldset disabled={locked || loading} className="flex min-w-0 flex-1 flex-col">
        <div className="p-4 space-y-3 border-b border-[var(--border)] bg-[var(--card)]">
          {/* From (Account Selector) */}
          <div className="flex items-center gap-3">
            <label htmlFor="compose-from" className="w-16 shrink-0 text-sm text-[var(--foreground-muted)]">Từ</label>
            <div className="relative min-w-0 flex-1">
              <select
                id="compose-from"
                value={selectedAccountId}
                onChange={event => setSelectedAccountId(event.target.value)}
                disabled={loadingAccounts || accounts.length === 0}
                className="focus-ring min-h-11 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] ps-3 pe-8 text-sm"
              >
                {accounts.length === 0 && <option value="">{loadingAccounts ? 'Đang tải…' : 'Chưa có tài khoản email'}</option>}
                {accounts.map(account => <option key={account.id} value={account.id}>{account.email_address}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]" />
              {!loadingAccounts && accounts.length === 0 && (
                <a href="/settings" className="mt-2 inline-block text-sm text-[var(--accent-foreground)] underline">Thêm tài khoản gửi</a>
              )}
            </div>
          </div>

          {/* To */}
          <div className="flex items-center gap-3">
            <label htmlFor="compose-to" className="w-16 shrink-0 text-sm text-[var(--foreground-muted)]">Đến</label>
            <input
              type="text"
              inputMode="email"
              id="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@example.com"
              required
              className="min-h-11 min-w-0 flex-1 px-3 py-2 border border-[var(--input-border)] rounded-[var(--radius-control)] focus-ring bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
            />
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="neo-target rounded-[var(--radius-control)] px-2 text-sm hover:bg-[var(--hover)]"
              >
                Cc
              </button>
            )}
          </div>

          {/* Cc */}
          {showCc && (
            <div className="flex items-center gap-3">
              <label htmlFor="compose-cc" className="w-16 shrink-0 text-sm text-[var(--foreground-muted)]">Cc</label>
              <input
                type="text"
                inputMode="email"
                id="compose-cc"
              value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="email@example.com"
                className="min-h-11 min-w-0 flex-1 px-3 py-2 border border-[var(--input-border)] rounded-[var(--radius-control)] focus-ring bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3">
            <label htmlFor="compose-subject" className="w-16 shrink-0 text-sm text-[var(--foreground-muted)]">Tiêu đề</label>
            <input
              type="text"
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Tiêu đề email"
              className="min-h-11 min-w-0 flex-1 px-3 py-2 border border-[var(--input-border)] rounded-[var(--radius-control)] focus-ring bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 bg-[var(--card)] flex flex-col">
          {/* AI Toolbar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Write with AI */}
            <button
              type="button"
              onClick={() => setShowAIPrompt(!showAIPrompt)}
              disabled={aiLoading}
              aria-expanded={showAIPrompt}
              className={cn(
                "neo-target flex min-h-8 items-center gap-1 px-3 py-1 text-xs font-medium rounded-[var(--radius-control)] transition-colors",
                showAIPrompt
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)]"
              )}
            >
              <FilePenLine className="w-3.5 h-3.5" />
              Viết
            </button>

            {/* Improve */}
            <button
              type="button"
              onClick={() => handleAIAction('improve')}
              disabled={aiLoading || !body.trim()}
              className="neo-target flex min-h-8 items-center gap-1 px-3 py-1 text-xs font-medium rounded-[var(--radius-control)] bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading && aiAction === 'improve' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              Cải thiện
            </button>

            {/* Shorter */}
            <button
              type="button"
              onClick={() => handleAIAction('shorter')}
              disabled={aiLoading || !body.trim()}
              className="neo-target flex min-h-8 items-center gap-1 px-3 py-1 text-xs font-medium rounded-[var(--radius-control)] bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading && aiAction === 'shorter' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              Ngắn hơn
            </button>

            {/* Longer */}
            <button
              type="button"
              onClick={() => handleAIAction('longer')}
              disabled={aiLoading || !body.trim()}
              className="neo-target flex min-h-8 items-center gap-1 px-3 py-1 text-xs font-medium rounded-[var(--radius-control)] bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading && aiAction === 'longer' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Dài hơn
            </button>

            {/* Formal */}
            <button
              type="button"
              onClick={() => handleAIAction('formal')}
              disabled={aiLoading || !body.trim()}
              className="neo-target flex min-h-8 items-center gap-1 px-3 py-1 text-xs font-medium rounded-[var(--radius-control)] bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading && aiAction === 'formal' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Briefcase className="w-3.5 h-3.5" />
              )}
              Trang trọng
            </button>

            {/* Friendly */}
            <button
              type="button"
              onClick={() => handleAIAction('friendly')}
              disabled={aiLoading || !body.trim()}
              className="neo-target flex min-h-8 items-center gap-1 px-3 py-1 text-xs font-medium rounded-[var(--radius-control)] bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading && aiAction === 'friendly' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Smile className="w-3.5 h-3.5" />
              )}
              Thân thiện
            </button>
          </div>

          {/* AI Write Prompt Input */}
          {showAIPrompt && (
            <div className="mb-3 p-3 bg-[var(--canvas)] border border-[var(--border)] rounded-[var(--radius-control)]">
              <div className="flex items-center gap-2 mb-2">
                <FilePenLine className="w-4 h-4 text-[var(--accent-foreground)]" />
                <span className="text-sm font-medium text-[var(--accent-foreground)]">Yêu cầu soạn bản nháp</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAIPrompt(e.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAIWrite()
                    }
                  }}
                  aria-label="Yêu cầu soạn bản nháp"
                  placeholder="Mô tả nội dung email cần viết... VD: Xin nghỉ phép 2 ngày vì lý do cá nhân"
                  className="min-w-0 flex-1 px-3 py-2 text-sm border border-[var(--input-border)] rounded-[var(--radius-control)] bg-white dark:bg-[var(--background)] focus-ring"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAIWrite}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium rounded-[var(--radius-control)] hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {aiLoading && aiAction === 'write' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ListChecks className="w-4 h-4" />
                  )}
                  Viết
                </button>
              </div>
            </div>
          )}

          {isFromAI && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[var(--secondary)] border border-[var(--border)] rounded-[var(--radius-control)] text-[14px] text-[var(--muted-foreground)]">
              <ListChecks className="w-4 h-4 text-[var(--accent-foreground)]" strokeWidth={1.5} />
              <span>Nội dung được tạo/chỉnh sửa bởi AI. Vui lòng xem lại trước khi gửi.</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            aria-label="Nội dung thư"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nội dung email..."
            className="flex-1 w-full min-h-48 sm:min-h-[300px] px-3 py-2 border border-[var(--border)] rounded-[var(--radius-control)] focus-ring resize-none bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
          />
        </div>

        </fieldset>
        <div className="border-t border-[var(--border)] px-4 py-3">
          <ComposeFiles key={sourceId ?? 'new'} files={files} onChange={fileCompose.setFiles} onBusy={fileCompose.setFileBusy}
            disabled={locked || loading || !!attempt.current} sourceId={sourceId ?? undefined} sourceFiles={fileCompose.sourceFiles} />
        </div>
        {state === 'draft' && <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--secondary)] p-4">
            {draft && <Button type="button" variant="ghost" disabled={!canSave}
              onClick={() => setConfirmDiscard(true)}>Xóa bản nháp</Button>}
            <Button type="button" variant="outline" loading={fileCompose.busy && !preview} disabled={!canSave}
              onClick={() => void fileCompose.save(fields, selectedAccountId)}>Lưu bản nháp</Button>
            <Button type="button" variant="outline" disabled={!canSave || !to.trim() || !subject.trim()}
              onClick={() => { setScheduleMode(true); void fileCompose.save(fields, selectedAccountId, true) }}>Lên lịch gửi</Button>
            <Button type="submit" onClick={() => setScheduleMode(false)} loading={loading} disabled={!to || locked || fileCompose.fileBusy || (durable && !canSave)}
              leftIcon={<Send size={18} aria-hidden="true" />}>
              {durable ? 'Xem trước thư gửi' : sendAction === 'check' ? 'Kiểm tra trạng thái' : sendAction === 'retry' ? 'Thử lại yêu cầu' : 'Gửi'}
            </Button>
        </div>}
      </form>
      {preview && scheduleMode && <ScheduleSendDialog mode="schedule" subject={preview.fields.subject}
        onClose={() => { fileCompose.setPreview(null); setScheduleMode(false) }}
        onSave={async (at, requestId) => {
          await composeDraftAction({ action: 'schedule', id: preview.id, revision: preview.revision, at, requestId })
          fileCompose.setPreview(null)
          router.push('/outbox')
        }}>{scopePreview}</ScheduleSendDialog>}
      {preview && !scheduleMode && <Modal open title="Xem trước thư gửi" description={preview.fields.subject}
        onClose={() => { if (!fileCompose.busy) fileCompose.setPreview(null) }} showCloseButton={!fileCompose.busy}
        closeOnEscape={!fileCompose.busy} footer={<>
          <Button type="button" variant="outline" disabled={fileCompose.busy} onClick={() => fileCompose.setPreview(null)}>Quay lại</Button>
          <Button type="button" loading={fileCompose.busy} onClick={() => void fileCompose.approve()}>Xác nhận gửi</Button>
        </>}>
        {scopePreview}
      </Modal>}
      {confirmDiscard && <Modal open title="Xóa bản nháp?" onClose={() => setConfirmDiscard(false)}
        footer={<><Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Giữ bản nháp</Button>
          <Button type="button" variant="danger" onClick={() => { setConfirmDiscard(false); void fileCompose.change('discard') }}>Xóa bản nháp</Button></>} />}
    </div>
  )
}
