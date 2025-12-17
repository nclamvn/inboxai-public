/**
 * Input Component
 * Premium text input with floating label, validation, icons
 */

'use client';

import React, { forwardRef, useState, useId } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Input variants
const inputVariants = {
  variant: {
    default: [
      'bg-[var(--input)] border-[var(--input-border)]',
      'hover:border-[var(--border-strong)]',
      'focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--input-focus)]/20',
    ].join(' '),
    filled: [
      'bg-[var(--secondary)] border-transparent',
      'hover:bg-[var(--hover)]',
      'focus:bg-[var(--input)] focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--input-focus)]/20',
    ].join(' '),
    flushed: [
      'bg-transparent border-transparent border-b border-b-[var(--border)] rounded-none',
      'hover:border-b-[var(--border-strong)]',
      'focus:border-b-[var(--input-focus)] focus:ring-0',
      'px-0',
    ].join(' '),
  },
  size: {
    sm: 'h-8 text-[13px] px-3',
    md: 'h-10 text-[14px] px-3',
    lg: 'h-12 text-[15px] px-4',
  },
};

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input variant */
  variant?: keyof typeof inputVariants.variant;
  /** Input size */
  size?: keyof typeof inputVariants.size;
  /** Label text */
  label?: string;
  /** Floating label */
  floatingLabel?: boolean;
  /** Helper text */
  helperText?: string;
  /** Error message or boolean */
  error?: string | boolean;
  /** Success state */
  success?: boolean;
  /** Left icon/element */
  leftElement?: React.ReactNode;
  /** Right icon/element */
  rightElement?: React.ReactNode;
  /** Icon (legacy support) */
  icon?: React.ReactNode;
  /** Full width */
  fullWidth?: boolean;
  /** Container class */
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      variant = 'default',
      size = 'md',
      type = 'text',
      label,
      floatingLabel = false,
      helperText,
      error,
      success,
      leftElement,
      rightElement,
      icon,
      fullWidth = false,
      disabled,
      id: propId,
      value,
      defaultValue,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = propId || generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(
      () => value !== undefined ? value !== '' : defaultValue !== undefined && defaultValue !== ''
    );

    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    const showFloatingLabel = floatingLabel && (isFocused || hasValue);

    // Support both string error messages and boolean error state
    const hasError = !!error;
    const errorMessage = typeof error === 'string' ? error : undefined;
    const hasSuccess = success && !hasError;

    // Support legacy icon prop
    const leftIcon = leftElement || icon;

    return (
      <div
        className={cn(
          'flex flex-col gap-1.5',
          fullWidth && 'w-full',
          containerClassName
        )}
      >
        {/* Static label (non-floating) */}
        {label && !floatingLabel && (
          <label
            htmlFor={id}
            className={cn(
              'text-[13px] font-medium text-[var(--foreground)]',
              disabled && 'text-[var(--foreground-muted)]'
            )}
          >
            {label}
            {props.required && (
              <span className="text-[var(--error)] ml-1">*</span>
            )}
          </label>
        )}

        {/* Input container */}
        <div className="relative">
          {/* Floating label */}
          {floatingLabel && label && (
            <label
              htmlFor={id}
              className={cn(
                'absolute left-3 transition-all duration-150 pointer-events-none z-10',
                'text-[var(--foreground-muted)]',
                showFloatingLabel
                  ? 'top-0 -translate-y-1/2 text-xs bg-[var(--background)] px-1 text-[var(--input-focus)]'
                  : 'top-1/2 -translate-y-1/2 text-[14px]',
                leftIcon && !showFloatingLabel && 'left-10',
                hasError && showFloatingLabel && 'text-[var(--error)]',
                hasSuccess && showFloatingLabel && 'text-[var(--success)]'
              )}
            >
              {label}
              {props.required && (
                <span className="text-[var(--error)] ml-1">*</span>
              )}
            </label>
          )}

          {/* Left element */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]">
              {leftIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={id}
            type={inputType}
            value={value}
            defaultValue={defaultValue}
            className={cn(
              // Base styles
              'w-full rounded-lg border outline-none',
              'transition-all duration-150',
              'placeholder:text-[var(--foreground-muted)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              // Variant
              inputVariants.variant[variant],
              // Size
              inputVariants.size[size],
              // Left padding for icon
              leftIcon && 'pl-10',
              // Right padding for icon/password toggle
              (rightElement || isPassword || hasError || hasSuccess) && 'pr-10',
              // Error state
              hasError && [
                'border-[var(--error)]',
                'focus:border-[var(--error)] focus:ring-[var(--error)]/20',
              ],
              // Success state
              hasSuccess && [
                'border-[var(--success)]',
                'focus:border-[var(--success)] focus:ring-[var(--success)]/20',
              ],
              className
            )}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              errorMessage ? `${id}-error` : helperText ? `${id}-helper` : undefined
            }
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            onChange={(e) => {
              setHasValue(e.target.value !== '');
              props.onChange?.(e);
            }}
            {...props}
          />

          {/* Right element / Password toggle / Status icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Custom right element */}
            {rightElement && !isPassword && !hasError && !hasSuccess && (
              <span className="text-[var(--foreground-muted)]">{rightElement}</span>
            )}

            {/* Password toggle */}
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-1 -m-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            )}

            {/* Error icon */}
            {hasError && !isPassword && (
              <AlertCircle className="h-4 w-4 text-[var(--error)]" />
            )}

            {/* Success icon */}
            {hasSuccess && !isPassword && (
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
            )}
          </div>
        </div>

        {/* Helper text / Error message */}
        {(errorMessage || helperText) && (
          <p
            id={errorMessage ? `${id}-error` : `${id}-helper`}
            className={cn(
              'text-xs',
              hasError ? 'text-[var(--error)]' : 'text-[var(--foreground-muted)]'
            )}
            role={hasError ? 'alert' : undefined}
          >
            {errorMessage || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea Component
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Full width */
  fullWidth?: boolean;
  /** Container class */
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      containerClassName,
      label,
      helperText,
      error,
      fullWidth = false,
      disabled,
      id: propId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = propId || generatedId;
    const hasError = !!error;

    return (
      <div
        className={cn(
          'flex flex-col gap-1.5',
          fullWidth && 'w-full',
          containerClassName
        )}
      >
        {label && (
          <label
            htmlFor={id}
            className={cn(
              'text-[13px] font-medium text-[var(--foreground)]',
              disabled && 'text-[var(--foreground-muted)]'
            )}
          >
            {label}
            {props.required && (
              <span className="text-[var(--error)] ml-1">*</span>
            )}
          </label>
        )}

        <textarea
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-lg border outline-none',
            'bg-[var(--input)] border-[var(--input-border)]',
            'hover:border-[var(--border-strong)]',
            'focus:border-[var(--input-focus)] focus:ring-2 focus:ring-[var(--input-focus)]/20',
            'transition-all duration-150',
            'placeholder:text-[var(--foreground-muted)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'min-h-[100px] px-3 py-2 text-[14px]',
            'resize-y',
            hasError && 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/20',
            className
          )}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            error ? `${id}-error` : helperText ? `${id}-helper` : undefined
          }
          {...props}
        />

        {(error || helperText) && (
          <p
            id={error ? `${id}-error` : `${id}-helper`}
            className={cn(
              'text-xs',
              hasError ? 'text-[var(--error)]' : 'text-[var(--foreground-muted)]'
            )}
            role={hasError ? 'alert' : undefined}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Input;
