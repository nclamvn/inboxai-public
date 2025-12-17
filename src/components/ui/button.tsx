/**
 * Button Component
 * Premium button with variants, sizes, states, loading
 */

'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Button variants using CSS variables
const buttonVariants = {
  variant: {
    primary: [
      'bg-[var(--primary)] text-[var(--primary-foreground)]',
      'hover:bg-[var(--primary-hover)]',
      'shadow-sm hover:shadow-md',
      'border border-transparent',
    ].join(' '),
    secondary: [
      'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
      'hover:bg-[var(--secondary-hover)]',
      'border border-[var(--border)]',
    ].join(' '),
    outline: [
      'bg-transparent text-[var(--foreground)]',
      'hover:bg-[var(--hover)]',
      'border border-[var(--border)] hover:border-[var(--border-strong)]',
    ].join(' '),
    ghost: [
      'bg-transparent text-[var(--foreground)]',
      'hover:bg-[var(--hover)]',
      'border border-transparent',
    ].join(' '),
    danger: [
      'bg-[var(--error)] text-white',
      'hover:bg-red-700 dark:hover:bg-red-600',
      'shadow-sm hover:shadow-md',
      'border border-transparent',
    ].join(' '),
    'danger-outline': [
      'bg-transparent text-[var(--error)]',
      'hover:bg-[var(--error-bg)]',
      'border border-[var(--error)]',
    ].join(' '),
    success: [
      'bg-[var(--success)] text-white',
      'hover:bg-green-700 dark:hover:bg-green-600',
      'shadow-sm hover:shadow-md',
      'border border-transparent',
    ].join(' '),
    link: [
      'bg-transparent text-[var(--info)]',
      'hover:text-blue-700 dark:hover:text-blue-400 hover:underline',
      'border border-transparent',
      'p-0 h-auto',
    ].join(' '),
  },
  size: {
    xs: 'h-7 px-2 text-xs gap-1 rounded-md',
    sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
    md: 'h-10 px-4 text-[14px] gap-2 rounded-lg',
    lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
    xl: 'h-14 px-8 text-base gap-3 rounded-xl',
    icon: 'h-10 w-10 rounded-lg p-0',
    'icon-xs': 'h-7 w-7 rounded-md p-0',
    'icon-sm': 'h-8 w-8 rounded-lg p-0',
    'icon-lg': 'h-12 w-12 rounded-xl p-0',
  },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: keyof typeof buttonVariants.variant;
  /** Button size */
  size?: keyof typeof buttonVariants.size;
  /** Loading state */
  loading?: boolean;
  /** Loading text */
  loadingText?: string;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
  /** Icon (legacy support) */
  icon?: React.ReactNode;
  /** Full width */
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      leftIcon,
      rightIcon,
      icon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const isIconOnly = size === 'icon' || size === 'icon-xs' || size === 'icon-sm' || size === 'icon-lg';

    // Determine icon sizes based on button size
    const getLoaderSize = () => {
      switch (size) {
        case 'xs':
        case 'icon-xs':
          return 'h-3 w-3';
        case 'sm':
        case 'icon-sm':
          return 'h-3.5 w-3.5';
        case 'lg':
        case 'icon-lg':
          return 'h-5 w-5';
        case 'xl':
          return 'h-6 w-6';
        default:
          return 'h-4 w-4';
      }
    };

    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center',
          'font-medium',
          'transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          'active:scale-[0.98]',
          'select-none',
          // Variant
          buttonVariants.variant[variant],
          // Size
          buttonVariants.size[size],
          // Full width
          fullWidth && 'w-full',
          className
        )}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <Loader2 className={cn('animate-spin', getLoaderSize())} strokeWidth={2} />
        )}

        {/* Left icon (hidden when loading) */}
        {!loading && (leftIcon || icon) && (
          <span className="shrink-0">{leftIcon || icon}</span>
        )}

        {/* Content */}
        {!isIconOnly && (
          loading && loadingText ? (
            <span>{loadingText}</span>
          ) : (
            children && <span>{children}</span>
          )
        )}

        {/* Icon-only children (for icon buttons) */}
        {isIconOnly && !loading && !leftIcon && !icon && children}

        {/* Right icon (hidden when loading) */}
        {!loading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

/**
 * IconButton - Button with only icon
 */
export interface IconButtonProps
  extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'loadingText' | 'fullWidth'> {
  /** Icon to display */
  icon: React.ReactNode;
  /** Accessible label (required) */
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'icon', children, ...props }, ref) => (
    <Button ref={ref} size={size} {...props}>
      {icon}
      {children}
    </Button>
  )
);

IconButton.displayName = 'IconButton';

export default Button;
