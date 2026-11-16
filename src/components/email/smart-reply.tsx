'use client'

import { useState, useEffect, useRef } from 'react'
import {
  FilePenLine, Check, Calendar, HelpCircle, Heart,
  Send, ChevronDown, ChevronUp, Loader2,
  MessageSquare, X, Edit3
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
  const scope = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    scope.current = controller
    setSuggestions([])
    setSelectedSuggestion(null)
    setCustomBullets('')
    setShowComposer(false)
    setHasLoaded(false)
    setTone('formal')
    setComposing(false)
    setLoading(true)
    async function load() {
      try {
        const res = await fetch(`/api/ai/smart-reply?emailId=${emailId}&tone=auto`, { signal: controller.signal })
        if (!res.ok) throw new Error('Reply suggestions unavailable')
        const data = await res.json()
        if (controller.signal.aborted) return
        setSuggestions(data.suggestions || [])
        if (data.detectedTone) setTone(data.detectedTone)
      } catch (error) {
        if (!controller.signal.aborted) console.error('Failed to fetch suggestions:', error)
      } finally {
        if (!controller.signal.aborted) { setLoading(false); setHasLoaded(true) }
      }
    }
    void load()
    return () => controller.abort()
  }, [emailId])

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
    const controller = scope.current
    if (!controller || controller.signal.aborted) return

    setComposing(true)
    try {
      const res = await fetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          emailId,
          bullets: customBullets,
          tone
        })
      })
      const data = await res.json()
      if (controller.signal.aborted) return
      if (data.reply) {
        onReply(data.reply, data.subject)
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error('Failed to compose:', error)
    } finally {
      if (!controller.signal.aborted) setComposing(false)
    }
  }

  if (loading) {
    return (
      <div className="mb-4 p-4 bg-[var(--secondary)] rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-foreground)]" />
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
      'mb-4 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)]'
    )}>
      {/* Header */}
      <button
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="neo-target flex w-full items-center justify-between p-3 hover:bg-[var(--hover)]"
      >
        <div className="flex items-center gap-3">
          <MessageSquare size={18} strokeWidth={1.5} aria-hidden="true" className="text-[var(--accent-foreground)]" />
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--foreground)]">Gợi ý trả lời</p>
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
              const isSelected = selectedSuggestion?.intent === suggestion.intent

              return (
                <button
                  type="button"
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  aria-pressed={isSelected}
                  className={cn(
                    'neo-target flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold hover:bg-[var(--hover)]',
                    isSelected && 'border-[var(--selection-line)] bg-[var(--accent)] text-[var(--accent-foreground)]'
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
              <span className="px-2 bg-[var(--surface)] text-[var(--foreground-muted)]">hoặc</span>
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
                    'focus-ring'
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
                      <FilePenLine className="w-4 h-4" />
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
