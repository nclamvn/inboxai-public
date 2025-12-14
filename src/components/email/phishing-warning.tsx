'use client'

import { useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldX, ChevronDown, ChevronUp, X, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhishingReason {
  type: string
  pattern: string
  severity: number
  description: string
}

interface PhishingWarningProps {
  score: number
  risk: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  reasons: PhishingReason[]
  isPhishing: boolean
  onDismiss?: () => void
  onMarkSafe?: () => void
  className?: string
}

const riskConfig = {
  safe: {
    icon: null,
    bgColor: '',
    borderColor: '',
    textColor: '',
    title: '',
  },
  low: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-800 dark:text-yellow-200',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    title: 'Cảnh báo nhẹ',
  },
  medium: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-800 dark:text-orange-200',
    iconColor: 'text-orange-600 dark:text-orange-400',
    title: 'Cảnh báo',
  },
  high: {
    icon: ShieldAlert,
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-800 dark:text-red-200',
    iconColor: 'text-red-600 dark:text-red-400',
    title: 'Nguy hiểm cao',
  },
  critical: {
    icon: ShieldX,
    bgColor: 'bg-red-100 dark:bg-red-950/50',
    borderColor: 'border-red-300 dark:border-red-700',
    textColor: 'text-red-900 dark:text-red-100',
    iconColor: 'text-red-700 dark:text-red-300',
    title: 'Phishing - Cực kỳ nguy hiểm!',
  },
}

const typeLabels: Record<string, string> = {
  blacklist: 'Domain blacklist',
  suspicious_tld: 'TLD đáng ngờ',
  spoofed_domain: 'Domain giả mạo',
  name_domain_mismatch: 'Tên không khớp domain',
  urgency: 'Tạo áp lực khẩn cấp',
  threat: 'Đe dọa',
  request: 'Yêu cầu thông tin nhạy cảm',
  prize: 'Lừa đảo trúng thưởng',
  financial: 'Liên quan tài chính',
  suspicious_url: 'Link đáng ngờ',
  combo_attack: 'Kết hợp nhiều kỹ thuật',
}

export function PhishingWarning({
  score,
  risk,
  reasons,
  isPhishing,
  onDismiss,
  onMarkSafe,
  className,
}: PhishingWarningProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Don't render for safe emails
  if (risk === 'safe' || dismissed) {
    return null
  }

  const config = riskConfig[risk]
  const Icon = config.icon

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  const handleMarkSafe = () => {
    setDismissed(true)
    onMarkSafe?.()
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {Icon && (
          <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.iconColor)} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn('font-semibold', config.textColor)}>
              {config.title}
            </h3>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-medium', config.textColor)}>
                Điểm: {score}/100
              </span>
              <button
                onClick={handleDismiss}
                className={cn(
                  'p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
                  config.textColor
                )}
                title="Ẩn cảnh báo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className={cn('text-sm mt-1', config.textColor, 'opacity-90')}>
            {isPhishing
              ? 'Email này có dấu hiệu lừa đảo. KHÔNG click vào link hoặc cung cấp thông tin cá nhân.'
              : 'Email này có một số dấu hiệu đáng ngờ. Hãy kiểm tra kỹ trước khi tương tác.'}
          </p>

          {/* Reasons (collapsible) */}
          {reasons.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className={cn(
                  'flex items-center gap-1 text-sm font-medium',
                  config.textColor,
                  'hover:underline'
                )}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {expanded ? 'Ẩn chi tiết' : `Xem ${reasons.length} lý do`}
              </button>

              {expanded && (
                <ul className="mt-2 space-y-1.5">
                  {reasons.map((reason, index) => (
                    <li
                      key={index}
                      className={cn(
                        'text-sm flex items-start gap-2',
                        config.textColor,
                        'opacity-90'
                      )}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mt-1.5 flex-shrink-0" />
                      <span>
                        <strong>{typeLabels[reason.type] || reason.type}:</strong>{' '}
                        {reason.description}
                        {reason.pattern && (
                          <code className="ml-1 px-1 py-0.5 bg-black/10 dark:bg-white/10 rounded text-xs">
                            {reason.pattern.length > 50
                              ? reason.pattern.slice(0, 50) + '...'
                              : reason.pattern}
                          </code>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {onMarkSafe && (
              <button
                onClick={handleMarkSafe}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
                  'bg-white dark:bg-gray-800 border',
                  config.borderColor,
                  config.textColor,
                  'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                )}
              >
                <Eye className="h-4 w-4" />
                Tôi đã kiểm tra, email này an toàn
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact version for email list items
 */
export function PhishingBadge({
  risk,
  score,
  className,
}: {
  risk: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  score: number
  className?: string
}) {
  if (risk === 'safe') return null

  const colors = {
    low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
    high: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    critical: 'bg-red-200 text-red-900 dark:bg-red-800/50 dark:text-red-100',
  }

  const labels = {
    low: 'Đáng ngờ',
    medium: 'Cảnh báo',
    high: 'Nguy hiểm',
    critical: 'Phishing!',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded',
        colors[risk],
        className
      )}
      title={`Điểm phishing: ${score}/100`}
    >
      <ShieldAlert className="h-3 w-3" />
      {labels[risk]}
    </span>
  )
}
