import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B9B]">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-10 px-3 text-[15px] text-[#1A1A1A] placeholder-[#9B9B9B]',
            'bg-white border rounded-lg transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:ring-offset-0',
            error
              ? 'border-[#DC2626] focus:ring-[#DC2626]'
              : 'border-[#EBEBEB] hover:border-[#D4D4D4]',
            icon && 'pl-10',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = 'Input'
