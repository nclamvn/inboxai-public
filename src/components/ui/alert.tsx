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
      container: 'bg-[var(--info-bg)] border-[var(--info)]/20 text-[var(--info)]',
      icon: 'text-[var(--info)]',
    },
    success: {
      container: 'bg-[var(--success-bg)] border-[var(--success)]/20 text-[var(--success)]',
      icon: 'text-[var(--success)]',
    },
    warning: {
      container: 'bg-[var(--warning-bg)] border-[var(--warning)]/20 text-[var(--warning)]',
      icon: 'text-[var(--warning)]',
    },
    error: {
      container: 'bg-[var(--error-bg)] border-[var(--error)]/20 text-[var(--error)]',
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
        role="alert"
        className={cn(
          'flex gap-3 p-4 rounded-lg border',
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
            <div className="text-sm opacity-90">
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
              'shrink-0 p-1 -m-1 rounded opacity-70 hover:opacity-100',
              'transition-opacity',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-current'
            )}
            aria-label="Close"
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
