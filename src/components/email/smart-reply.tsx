'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles, Check, Calendar, HelpCircle, Heart,
  Send, ChevronDown, ChevronUp, Loader2,
  MessageSquare, Zap, X, Edit3
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReplySuggestion {
  intent: string
  label: string
  icon: string
  preview: string
  fullReply: string
  subject: string
}

interface SmartReplyProps {
  emailId: string
  onReply: (content: string, subject: string) => void
}

const intentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  agree: Check,
  confirm: Check,
  decline: X,
  schedule: Calendar,
  ask_more: HelpCircle,
  thank: Heart,
  forward: Send,
  custom: Edit3,
}

// Use CSS variables for text to ensure correct theme contrast
const intentColors: Record<string, string> = {
  agree: 'bg-green-100 text-[var(--foreground)] dark:bg-green-500/20 hover:bg-green-200 dark:hover:bg-green-500/30',
  confirm: 'bg-green-100 text-[var(--foreground)] dark:bg-green-500/20 hover:bg-green-200 dark:hover:bg-green-500/30',
  decline: 'bg-red-100 text-[var(--foreground)] dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30',
  schedule: 'bg-blue-100 text-[var(--foreground)] dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30',
  ask_more: 'bg-purple-100 text-[var(--foreground)] dark:bg-purple-500/20 hover:bg-purple-200 dark:hover:bg-purple-500/30',
  thank: 'bg-pink-100 text-[var(--foreground)] dark:bg-pink-500/20 hover:bg-pink-200 dark:hover:bg-pink-500/30',
  forward: 'bg-gray-200 text-[var(--foreground)] dark:bg-gray-500/20 hover:bg-gray-300 dark:hover:bg-gray-500/30',
}

export function SmartReply({ emailId, onReply }: SmartReplyProps) {
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [selectedSuggestion, setSelectedSuggestion] = useState<ReplySuggestion | null>(null)
  const [customBullets, setCustomBullets] = useState('')
  const [composing, setComposing] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [tone, setTone] = useState<'formal' | 'casual'>('formal')
  const [hasLoaded, setHasLoaded] = useState(false)

  // Reset when email changes
  useEffect(() => {
    setSuggestions([])
    setSelectedSuggestion(null)
    setCustomBullets('')
    setShowComposer(false)
    setHasLoaded(false)
  }, [emailId])

  useEffect(() => {
    if (emailId && !hasLoaded) {
      fetchSuggestions()
    }
  }, [emailId, hasLoaded])

  const fetchSuggestions = async () => {
    setLoading(true)
    setHasLoaded(true)
    try {
      const res = await fetch(`/api/ai/smart-reply?emailId=${emailId}&tone=auto`)
      const data = await res.json()
      setSuggestions(data.suggestions || [])
      if (data.detectedTone) {
        setTone(data.detectedTone)
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: ReplySuggestion) => {
    setSelectedSuggestion(suggestion)
  }

  const handleUseReply = () => {
    if (selectedSuggestion) {
      onReply(selectedSuggestion.fullReply, selectedSuggestion.subject)
    }
  }

  const handleComposeFromBullets = async () => {
    if (!customBullets.trim()) return

    setComposing(true)
    try {
      const res = await fetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId,
          bullets: customBullets,
          tone
        })
      })
      const data = await res.json()

      if (data.reply) {
        onReply(data.reply, data.subject)
      }
    } catch (error) {
      console.error('Failed to compose:', error)
    } finally {
      setComposing(false)
    }
  }

  if (loading) {
    return (
      <div className="mb-4 p-4 bg-[var(--secondary)] rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-sm text-[var(--foreground-secondary)]">Đang tạo gợi ý trả lời...</span>
        </div>
      </div>
    )
  }

  if (suggestions.length === 0 && hasLoaded) {
    return null
  }

  return (
    <div className={cn(
      'mb-4 rounded-xl border overflow-hidden transition-all duration-200',
      'bg-gradient-to-r from-blue-50/50 to-indigo-50/50',
      'dark:from-blue-500/5 dark:to-indigo-500/5',
      'border-blue-100 dark:border-blue-500/20'
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--foreground)]">Gợi ý trả lời</p>
            <p className="text-xs text-[var(--foreground-muted)]">AI đề xuất - Click để chọn</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--foreground-muted)]" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4">
          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestions.map((suggestion, index) => {
              const Icon = intentIcons[suggestion.intent] || MessageSquare
              const colorClass = intentColors[suggestion.intent] || intentColors.forward
              const isSelected = selectedSuggestion?.intent === suggestion.intent

              return (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold',
                    'transition-all duration-150',
                    colorClass,
                    isSelected && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {suggestion.label}
                </button>
              )
            })}
          </div>

          {/* Selected suggestion preview */}
          {selectedSuggestion && (
            <div className="mb-4 p-4 bg-white dark:bg-white/5 rounded-xl border border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wide">
                  Xem trước
                </span>
                <span className="text-xs text-[var(--foreground-subtle)]">
                  {selectedSuggestion.subject}
                </span>
              </div>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                {selectedSuggestion.fullReply}
              </p>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setSelectedSuggestion(null)}
                  className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                >
                  Hủy
                </button>
                <button
                  onClick={handleUseReply}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm font-medium hover:opacity-90"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dùng reply này
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-blue-50/80 dark:bg-[var(--background)] text-[var(--foreground-muted)]">hoặc</span>
            </div>
          </div>

          {/* Custom compose */}
          <div>
            <button
              onClick={() => setShowComposer(!showComposer)}
              className="flex items-center gap-2 text-sm font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] mb-2"
            >
              <Edit3 className="w-4 h-4" />
              Viết ý chính, AI soạn email
              {showComposer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showComposer && (
              <div className="space-y-3">
                {/* Tone selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--foreground-muted)]">Tone:</span>
                  <button
                    onClick={() => setTone('formal')}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      tone === 'formal'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--hover)]'
                    )}
                  >
                    Formal
                  </button>
                  <button
                    onClick={() => setTone('casual')}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      tone === 'casual'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--hover)]'
                    )}
                  >
                    Casual
                  </button>
                </div>

                {/* Bullets input */}
                <textarea
                  value={customBullets}
                  onChange={(e) => setCustomBullets(e.target.value)}
                  placeholder="Ví dụ: đồng ý, sẽ gửi báo cáo trước thứ 6, hẹn họp 2pm thứ 3"
                  rows={2}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-white dark:bg-white/5 border border-[var(--border)]',
                    'placeholder:text-[var(--foreground-subtle)]',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                  )}
                />

                <button
                  onClick={handleComposeFromBullets}
                  disabled={!customBullets.trim() || composing}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg',
                    'bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-sm',
                    'hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-opacity'
                  )}
                >
                  {composing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang soạn...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Soạn email
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
