import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function SectionHeader({
  title,
  description,
  icon,
  action,
  className
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center text-white">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-[18px] font-medium text-[#1A1A1A]">
            {title}
          </h2>
          {description && (
            <p className="text-[14px] text-[#6B6B6B] mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
