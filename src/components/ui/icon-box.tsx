import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface IconBoxProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'primary' | 'red' | 'amber' | 'emerald' | 'blue' | 'violet'
  size?: 'sm' | 'md' | 'lg'
}

export const IconBox = forwardRef<HTMLDivElement, IconBoxProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'flex items-center justify-center rounded-lg'

    const variants = {
      default: 'bg-[#F5F5F5] text-[#6B6B6B]',
      primary: 'bg-[#1A1A1A] text-white',
      red: 'bg-[#FEF2F2] text-[#DC2626]',
      amber: 'bg-[#FFFBEB] text-[#D97706]',
      emerald: 'bg-[#F0FDF4] text-[#059669]',
      blue: 'bg-[#EFF6FF] text-[#2563EB]',
      violet: 'bg-[#F5F3FF] text-[#7C3AED]',
    }

    const sizes = {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12',
    }

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

IconBox.displayName = 'IconBox'
