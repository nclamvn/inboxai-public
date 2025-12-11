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
      default: 'bg-[#F5F5F5] text-[#1A1A1A]',
      secondary: 'bg-transparent text-[#6B6B6B] border border-[#EBEBEB]',
      urgent: 'bg-[#FEF2F2] text-[#DC2626]',
      warning: 'bg-[#FFFBEB] text-[#B45309]',
      success: 'bg-[#F0FDF4] text-[#16A34A]',
      info: 'bg-[#EFF6FF] text-[#2563EB]',
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
