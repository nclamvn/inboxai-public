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
      default: 'bg-[var(--secondary)] text-[var(--foreground)]',
      secondary: 'bg-transparent text-[var(--muted)] border border-[var(--border)]',
      urgent: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      success: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
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
