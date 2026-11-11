/**
 * Alert Component
 * Inline alerts/notifications
 */

'use client';

import React, { forwardRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Alert variants
const alertVariants = {
  variant: {
    info: {
      container: 'bg-[var(--surface)] border-[var(--border)] border-s-[var(--info)] text-[var(--info)]',
      icon: 'text-[var(--info)]',
    },
    success: {
      container: 'bg-[var(--surface)] border-[var(--border)] border-s-[var(--success)] text-[var(--success)]',
      icon: 'text-[var(--success)]',
    },
    warning: {
      container: 'bg-[var(--surface)] border-[var(--border)] border-s-[var(--warning)] text-[var(--warning)]',
      icon: 'text-[var(--warning)]',
    },
    error: {
      container: 'bg-[var(--surface)] border-[var(--border)] border-s-[var(--error)] text-[var(--error)]',
      icon: 'text-[var(--error)]',
    },
  },
};

// Alert icons
const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Alert variant */
  variant?: keyof typeof alertVariants.variant;
  /** Alert title */
  title?: string;
  /** Show icon */
  showIcon?: boolean;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Closable */
  closable?: boolean;
  /** Close handler */
  onClose?: () => void;
  /** Action element */
  action?: React.ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant = 'info',
      title,
      showIcon = true,
      icon,
      closable = false,
      onClose,
      action,
      children,
      ...props
    },
    ref
  ) => {
    const IconComponent = alertIcons[variant];
    const styles = alertVariants.variant[variant];

    return (
      <div
        ref={ref}
        role={variant === 'error' ? 'alert' : 'status'}
        className={cn(
          'flex gap-3 p-4 border border-s-2 rounded-[var(--radius-control)]',
          styles.container,
          className
        )}
        {...props}
      >
        {/* Icon */}
        {showIcon && (
          <div className="shrink-0 mt-0.5">
            {icon || <IconComponent className={cn('h-5 w-5', styles.icon)} />}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <h5 className="font-medium mb-1">
              {title}
            </h5>
          )}
          {children && (
            <div className="text-sm text-[var(--foreground-secondary)]">
              {children}
            </div>
          )}
          {action && (
            <div className="mt-3">
              {action}
            </div>
          )}
        </div>

        {/* Close button */}
        {closable && (
          <button
            onClick={onClose}
            className={cn(
              'neo-icon-button -my-2 -me-2',
              'transition-opacity',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-current'
            )}
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);

Alert.displayName = 'Alert';

export default Alert;
