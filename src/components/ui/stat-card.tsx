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
      'p-5 rounded-xl border border-[#EBEBEB] bg-white',
      className
    )}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center">
          <span className="text-[#6B6B6B]">{icon}</span>
        </div>
        <span className="text-[13px] text-[#6B6B6B]">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[28px] font-semibold text-[#1A1A1A] tracking-tight">
          {value}
        </p>
        {trend && (
          <span className={cn(
            'text-[13px] font-medium',
            trend.direction === 'up' && 'text-[#16A34A]',
            trend.direction === 'down' && 'text-[#DC2626]',
            trend.direction === 'stable' && 'text-[#9B9B9B]'
          )}>
            {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      {subtext && (
        <p className="text-[12px] text-[#9B9B9B] mt-1">{subtext}</p>
      )}
    </div>
  )
}
