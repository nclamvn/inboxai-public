'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send, Paperclip, X, Loader2, Sparkles, ChevronDown } from 'lucide-react'

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
  const [error, setError] = useState<string | null>(null)
  const [isFromAI, setIsFromAI] = useState(false)

  // Account selection
  const [accounts, setAccounts] = useState<SourceAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  // Fetch source accounts
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch('/api/source-accounts')
        if (res.ok) {
          const data = await res.json()
          const activeAccounts = (data.accounts || []).filter((a: SourceAccount) => a.is_active)
          setAccounts(activeAccounts)
          if (activeAccounts.length > 0) {
            setSelectedAccountId(activeAccounts[0].id)
          }
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

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!to.trim() || !subject.trim()) {
      setError('Vui lòng điền đầy đủ thông tin người nhận và tiêu đề.')
      return
    }

    if (!selectedAccountId) {
      setError('Vui lòng chọn tài khoản gửi.')
      return
    }

    setLoading(true)

    try {
      const replyToEmailId = searchParams.get('replyToEmailId')

      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId: selectedAccountId,
          to: to.split(',').map(e => e.trim()),
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>'),
          cc: cc ? cc.split(',').map(e => e.trim()) : undefined,
          replyToEmailId: replyToEmailId || undefined
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Gửi email thất bại')
      }

      router.push('/sent')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể gửi email. Vui lòng thử lại.'
      setError(errorMessage)
    } finally {
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
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--card)]">
        <h1 className="text-[18px] font-semibold text-[var(--foreground)]">Soạn thư mới</h1>
        <button
          onClick={handleDiscard}
          className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-lg transition-colors"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSend} className="flex-1 flex flex-col">
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-red-600 dark:text-red-400 text-[14px]">
            {error}
          </div>
        )}

        <div className="p-4 space-y-3 border-b border-[var(--border)] bg-[var(--card)]">
          {/* From (Account Selector) */}
          <div className="flex items-center gap-3">
            <label className="w-16 text-[14px] text-[var(--muted-foreground)]">Từ</label>
            <div className="relative flex-1">
              {loadingAccounts ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-[var(--border)] rounded-lg text-[var(--muted-foreground)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[14px]">Đang tải...</span>
                </div>
              ) : accounts.length === 0 ? (
                <div className="px-3 py-2 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400 text-[14px]">
                  Chưa có tài khoản email. <a href="/settings" className="underline">Thêm ngay</a>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 border border-[var(--border)] rounded-lg hover:border-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-colors bg-[var(--background)]"
                  >
                    <span className="text-[14px] text-[var(--foreground)]">
                      {selectedAccount?.email_address || 'Chọn tài khoản'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showAccountDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg z-50 py-1">
                      {accounts.map(account => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => {
                            setSelectedAccountId(account.id)
                            setShowAccountDropdown(false)
                          }}
                          className={`w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--secondary)] transition-colors ${
                            account.id === selectedAccountId ? 'bg-[var(--secondary)] text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                          }`}
                        >
                          {account.email_address}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* To */}
          <div className="flex items-center gap-3">
            <label className="w-16 text-[14px] text-[var(--muted-foreground)]">Đến</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@example.com"
              required
              className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
            />
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-[14px] text-[var(--foreground)] hover:underline"
              >
                Cc
              </button>
            )}
          </div>

          {/* Cc */}
          {showCc && (
            <div className="flex items-center gap-3">
              <label className="w-16 text-[14px] text-[var(--muted-foreground)]">Cc</label>
              <input
                type="email"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3">
            <label className="w-16 text-[14px] text-[var(--muted-foreground)]">Tiêu đề</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Tiêu đề email"
              className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 bg-[var(--card)]">
          {isFromAI && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-[14px] text-[var(--muted-foreground)]">
              <Sparkles className="w-4 h-4 text-[var(--foreground)]" strokeWidth={1.5} />
              <span>Nội dung được tạo bởi AI. Vui lòng xem lại trước khi gửi.</span>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nội dung email..."
            className="w-full h-full min-h-[300px] px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted)]"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border)] bg-[var(--secondary)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover)] rounded-lg transition-colors"
              title="Đính kèm file"
            >
              <Paperclip className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              className="px-4 py-2 text-[var(--muted-foreground)] hover:bg-[var(--hover)] rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !to}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
              ) : (
                <>
                  <Send className="w-5 h-5" strokeWidth={1.5} />
                  Gửi
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
