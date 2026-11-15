'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Tag, MessageSquare, ArrowRight } from 'lucide-react'

const STORAGE_KEY = 'inboxai_onboarding_seen'

interface Feature {
  icon: React.ElementType
  title: string
  description: string
}

const aiFeatures: Feature[] = [
  {
    icon: Tag,
    title: 'Tự động phân loại',
    description: 'AI tự động phân loại email thành Công việc, Cá nhân, Giao dịch...'
  },
  {
    icon: Mail,
    title: 'Tóm tắt thông minh',
    description: 'Xem nhanh nội dung chính của email dài'
  },
  {
    icon: MessageSquare,
    title: 'Gợi ý phản hồi',
    description: 'AI gợi ý các câu trả lời phù hợp cho từng email'
  }
]

export function AIIntroTooltip() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    // Only show for first-time users after a short delay
    const timer = setTimeout(() => {
      const seen = localStorage.getItem(STORAGE_KEY)
      if (!seen) {
        setShow(true)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShow(false)
  }

  const nextStep = () => {
    if (step < aiFeatures.length - 1) {
      setStep(step + 1)
    } else {
      dismiss()
    }
  }

  if (!show) return null

  const currentFeature = aiFeatures[step]

  return (
    <div className="fixed right-4 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+16px)] z-50 md:bottom-4">
      <div className="w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-strong)] bg-[var(--surface)]">

        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
          <div className="flex items-center gap-2">

            <span className="font-semibold">InboxAI</span>
          </div>
          <button
            onClick={dismiss}
            className="neo-icon-button"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-control)] bg-[var(--secondary)] flex items-center justify-center flex-shrink-0">
              <currentFeature.icon className="w-5 h-5 text-[var(--accent-foreground)]" />
            </div>
            <div>
              <h4 className="font-semibold text-[var(--foreground)] text-[15px]">
                {currentFeature.title}
              </h4>
              <p className="text-[13px] text-[var(--muted-foreground)] mt-1">
                {currentFeature.description}
              </p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {aiFeatures.map((_, index) => (
              <div
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  index === step
                    ? 'bg-[var(--selection-line)]'
                    : index < step
                    ? 'bg-[var(--border-strong)]'
                    : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={dismiss}
              className="text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Bỏ qua
            </button>
            <button
              onClick={nextStep}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              {step < aiFeatures.length - 1 ? (
                <>
                  Tiếp theo
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                'Bắt đầu'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
