import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      <div className="w-16 h-16 rounded-2xl bg-[#F5F5F5] flex items-center justify-center mb-4 text-[#D4D4D4]">
        {icon}
      </div>
      <h3 className="text-[16px] font-medium text-[#1A1A1A]">
        {title}
      </h3>
      {description && (
        <p className="text-[14px] text-[#6B6B6B] mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
