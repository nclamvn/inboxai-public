import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  subtext?: string
  trend?: {
    value: number
    direction: 'up' | 'down' | 'stable'
  }
  className?: string
}

export function StatCard({
  icon,
  label,
  value,
  subtext,
  trend,
  className
}: StatCardProps) {
  return (
    <div className={cn(
      'p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]',
      className
    )}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
        <span className="text-[13px] text-[var(--muted-foreground)]">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[28px] font-semibold text-[var(--foreground)] tracking-tight">
          {value}
        </p>
        {trend && (
          <span className={cn(
            'text-[13px] font-medium',
            trend.direction === 'up' && 'text-green-600 dark:text-green-400',
            trend.direction === 'down' && 'text-red-600 dark:text-red-400',
            trend.direction === 'stable' && 'text-[var(--muted)]'
          )}>
            {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      {subtext && (
        <p className="text-[12px] text-[var(--muted)] mt-1">{subtext}</p>
      )}
    </div>
  )
}
