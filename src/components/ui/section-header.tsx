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
          <span className="text-gray-500 dark:text-gray-400">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-[18px] font-medium text-[var(--foreground)]">
            {title}
          </h2>
          {description && (
            <p className="text-[14px] text-[var(--muted-foreground)] mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
