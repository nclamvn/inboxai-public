'use client'

import { useState, useEffect } from 'react'
import { X, Sparkles, Mail, Tag, Zap, ArrowRight } from 'lucide-react'

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
    icon: Zap,
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
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[var(--card)] rounded-2xl shadow-xl border border-[var(--border)] w-[340px] overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5" />
            <span className="font-semibold">InboxAI</span>
          </div>
          <button
            onClick={dismiss}
            className="text-white/80 hover:text-white transition-colors p-1"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center flex-shrink-0">
              <currentFeature.icon className="w-5 h-5 text-blue-500" />
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
                    ? 'bg-blue-500'
                    : index < step
                    ? 'bg-blue-300'
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
