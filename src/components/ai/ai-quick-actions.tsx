'use client'

import { Sparkles, FileText, Mail, Search, Zap } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface AIQuickActionsProps {
  collapsed?: boolean
}

const quickActions = [
  {
    href: '/insights',
    icon: FileText,
    label: 'Insights',
    description: 'Báo cáo & phân tích email'
  },
  {
    href: '/compose?ai=true',
    icon: Mail,
    label: 'Soạn AI',
    description: 'Soạn email với AI'
  },
  {
    href: '/inbox?search=true',
    icon: Search,
    label: 'Tìm kiếm',
    description: 'Tìm kiếm thông minh'
  },
  {
    href: '/actions',
    icon: Zap,
    label: 'Nhanh',
    description: 'Hành động nhanh'
  }
]

export function AIQuickActions({ collapsed = false }: AIQuickActionsProps) {
  if (collapsed) {
    return (
      <div className="px-1.5 py-2">
        <Link
          href="/insights"
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 transition-colors"
          title="✨ AI Assistant"
        >
          <Sparkles className="w-5 h-5 text-yellow-500" />
        </Link>
      </div>
    )
  }

  return (
    <div className="px-3 py-3">
      <div className="p-3 bg-gradient-to-br from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 rounded-xl border border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-[var(--foreground)]">AI Assistant</span>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 rounded-lg',
                'text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
                'hover:bg-[var(--secondary)] transition-colors',
                'text-[12px]'
              )}
              title={action.description}
            >
              <action.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
              <span className="truncate">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
