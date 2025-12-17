/**
 * Spinner Component
 * Loading indicators
 */

'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Spinner sizes
const spinnerSizes = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size */
  size?: keyof typeof spinnerSizes;
  /** Color */
  color?: 'primary' | 'secondary' | 'current' | 'white';
  /** Label for screen readers */
  label?: string;
}

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  (
    {
      className,
      size = 'md',
      color = 'primary',
      label = 'Loading...',
      ...props
    },
    ref
  ) => {
    const colorClasses = {
      primary: 'text-[var(--primary)]',
      secondary: 'text-[var(--foreground-secondary)]',
      current: 'text-current',
      white: 'text-white',
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn('inline-flex', className)}
        {...props}
      >
        <Loader2
          className={cn(
            'animate-spin',
            spinnerSizes[size],
            colorClasses[color]
          )}
        />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';

/**
 * LoadingOverlay - Full screen or container loading
 */
export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Loading state */
  loading: boolean;
  /** Spinner size */
  spinnerSize?: keyof typeof spinnerSizes;
  /** Loading text */
  text?: string;
  /** Blur background */
  blur?: boolean;
}

export const LoadingOverlay = forwardRef<HTMLDivElement, LoadingOverlayProps>(
  (
    {
      className,
      loading,
      spinnerSize = 'lg',
      text,
      blur = true,
      children,
      ...props
    },
    ref
  ) => {
    if (!loading) return <>{children}</>;

    return (
      <div ref={ref} className={cn('relative', className)} {...props}>
        {children}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-3',
            'bg-[var(--background)]/80',
            blur && 'backdrop-blur-sm',
            'z-10'
          )}
        >
          <Spinner size={spinnerSize} />
          {text && (
            <p className="text-sm text-[var(--foreground-secondary)]">{text}</p>
          )}
        </div>
      </div>
    );
  }
);

LoadingOverlay.displayName = 'LoadingOverlay';

export default Spinner;
