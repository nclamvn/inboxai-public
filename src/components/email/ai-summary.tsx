'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles, ChevronDown, ChevronUp, RefreshCw,
  Calendar, AlertCircle, CheckCircle, Clock,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SummaryData {
  summary: string[]
  keyDates?: string[]
  actionRequired: boolean
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent'
  wordCount: number
}

interface AISummaryProps {
  emailId: string
  bodyLength: number
}

const sentimentConfig = {
  positive: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10' },
  neutral: { icon: Sparkles, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  negative: { icon: AlertCircle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10' },
  urgent: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10' },
}

const sentimentLabels = {
  positive: 'Tích cực',
  neutral: 'Bình thường',
  negative: 'Lưu ý',
  urgent: 'Khẩn cấp',
}

export function AISummary({ emailId, bodyLength }: AISummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)

  // Min 400 characters to show summary
  const minLength = 400
  const shouldShow = bodyLength >= minLength

  useEffect(() => {
    if (shouldShow && emailId && !hasChecked) {
      fetchSummary()
    }
  }, [emailId, shouldShow, hasChecked])

  // Reset when email changes
  useEffect(() => {
    setSummary(null)
    setHasChecked(false)
    setError('')
    setCollapsed(false)
  }, [emailId])

  const fetchSummary = async (force = false) => {
    setLoading(true)
    setError('')
    setHasChecked(true)

    try {
      const res = await fetch(`/api/emails/${emailId}/summary`, {
        method: force ? 'POST' : 'GET'
      })
      const data = await res.json()

      if (data.summary) {
        setSummary(data.summary)
      } else {
        setSummary(null)
      }
    } catch (err) {
      setError('Không thể tạo tóm tắt')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Don't render if email is short
  if (!shouldShow) return null

  // Loading state
  if (loading) {
    return (
      <div className="mb-4 p-4 bg-[var(--secondary)] rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Đang tạo tóm tắt AI...</p>
            <p className="text-xs text-[var(--foreground-muted)]">Chờ vài giây</p>
          </div>
        </div>
      </div>
    )
  }

  // No summary available (silently hide)
  if (!summary && hasChecked && !error) {
    return null
  }

  // Error state
  if (error) {
    return (
      <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/20">
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => fetchSummary(true)}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  if (!summary) return null

  const sentimentStyle = sentimentConfig[summary.sentiment]
  const SentimentIcon = sentimentStyle.icon

  return (
    <div className={cn(
      'mb-4 rounded-xl border overflow-hidden transition-all duration-200',
      'bg-gradient-to-r from-indigo-50/50 to-purple-50/50',
      'dark:from-indigo-500/5 dark:to-purple-500/5',
      'border-indigo-100 dark:border-indigo-500/20'
    )}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            'bg-gradient-to-br from-indigo-500 to-purple-500'
          )}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--foreground)]">AI Tóm tắt</p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {summary.wordCount} từ → {summary.summary.length} điểm chính
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sentiment badge */}
          <span className={cn(
            'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
            sentimentStyle.bg, sentimentStyle.color
          )}>
            <SentimentIcon className="w-3 h-3" />
            {sentimentLabels[summary.sentiment]}
          </span>

          {/* Action required badge */}
          {summary.actionRequired && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400">
              Cần xử lý
            </span>
          )}

          {/* Collapse toggle */}
          {collapsed ? (
            <ChevronDown className="w-5 h-5 text-[var(--foreground-muted)]" />
          ) : (
            <ChevronUp className="w-5 h-5 text-[var(--foreground-muted)]" />
          )}
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-4 pb-4">
          {/* Summary bullets */}
          <ul className="space-y-2">
            {summary.summary.map((point, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <span className="text-sm text-[var(--foreground)] leading-relaxed">
                  {point}
                </span>
              </li>
            ))}
          </ul>

          {/* Key dates */}
          {summary.keyDates && summary.keyDates.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wide">
                  Ngày quan trọng
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.keyDates.map((date, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-white/10 rounded-lg text-xs text-[var(--foreground)] border border-[var(--border)]"
                  >
                    <Clock className="w-3 h-3 text-[var(--foreground-muted)]" />
                    {date}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Regenerate button */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-end">
            <button
              onClick={() => fetchSummary(true)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              Tạo lại
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
