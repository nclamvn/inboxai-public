'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send, Paperclip, X, Loader2, ListChecks, ChevronDown, FilePenLine, FileText, Minus, Plus, Briefcase, Smile } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
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
            activeAccounts.some((account: SourceAccount) => account.id === current) ? current : activeAccounts[0]?.id || '',
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
    const replyTo = searchParams.get('replyTo')
    const subjectParam = searchParams.get('subject')
    const bodyParam = searchParams.get('body')

    if (replyTo) setTo(replyTo)
    if (subjectParam) setSubject(subjectParam)
    if (bodyParam) {
      setBody(bodyParam)
      setIsFromAI(true)
    }
  }, [searchParams])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sendBusy.current) return
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
    if (to || subject || body) {
      if (confirm('Bạn có chắc muốn hủy email này?')) {
        router.back()
      }
    } else {
      router.back()
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col border-x border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--card)]">
        <h1 className="neo-title">Soạn thư mới</h1>
        <button
          type="button" onClick={handleDiscard} aria-label="Đóng soạn thư"
          className="neo-icon-button"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSend} className="flex-1 flex flex-col">
        {error && (
          <Alert variant="error" className="mx-4 mt-4">
            {error}
            {needsGmailPermission && <a href="/settings#email-accounts" target="_blank" rel="noopener noreferrer"
              className="ml-2 inline-flex min-h-11 items-center underline">Mở Cài đặt tài khoản</a>}
          </Alert>
        )}

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

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border)] bg-[var(--secondary)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="neo-icon-button"
              aria-label="Đính kèm tệp"
            >
              <Paperclip className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              className="px-4 py-2 text-[var(--muted-foreground)] hover:bg-[var(--hover)] rounded-[var(--radius-control)] transition-colors"
            >
              Hủy
            </button>
            <Button type="submit" loading={loading} disabled={!to} leftIcon={<Send size={18} aria-hidden="true" />}>
              {sendAction === 'check' ? 'Kiểm tra trạng thái' : sendAction === 'retry' ? 'Thử lại yêu cầu' : 'Gửi'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
