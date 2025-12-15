import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'urgent' | 'warning' | 'success' | 'info'
  size?: 'sm' | 'md'
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'sm', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center font-medium'

    const variants = {
      default: 'bg-[var(--secondary)] !text-gray-900 dark:!text-gray-100',
      secondary: 'bg-transparent !text-gray-600 dark:!text-gray-400 border border-[var(--border)]',
      urgent: 'bg-red-100 dark:bg-red-900/30 !text-gray-900 dark:!text-gray-100',
      warning: 'bg-amber-100 dark:bg-amber-900/30 !text-gray-900 dark:!text-gray-100',
      success: 'bg-green-100 dark:bg-green-900/30 !text-gray-900 dark:!text-gray-100',
      info: 'bg-blue-100 dark:bg-blue-900/30 !text-gray-900 dark:!text-gray-100',
    }

    const sizes = {
      sm: 'h-5 px-2 text-[11px] rounded',
      md: 'h-6 px-2.5 text-[12px] rounded-md',
    }

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
