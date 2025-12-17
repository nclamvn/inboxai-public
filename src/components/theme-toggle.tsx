/**
 * ThemeToggle Component
 * Button to toggle light/dark mode
 */

'use client';

import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  /** Show all three options (light, dark, system) */
  showSystem?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

export function ThemeToggle({
  showSystem = false,
  size = 'md',
  className,
}: ThemeToggleProps) {
  const { mode, theme, setMode, toggle } = useTheme();

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  // Simple toggle (light/dark only)
  if (!showSystem) {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'inline-flex items-center justify-center rounded-lg',
          'bg-secondary hover:bg-secondary-hover',
          'border border-border',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          sizeClasses[size],
          className
        )}
        aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
      >
        {theme === 'dark' ? (
          <Sun size={iconSizes[size]} className="text-foreground" />
        ) : (
          <Moon size={iconSizes[size]} className="text-foreground" />
        )}
      </button>
    );
  }

  // Three-way toggle (light/dark/system)
  const options: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: 'light', icon: Sun, label: 'Chế độ sáng' },
    { mode: 'dark', icon: Moon, label: 'Chế độ tối' },
    { mode: 'system', icon: Monitor, label: 'Theo hệ thống' },
  ];

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg',
        'bg-secondary',
        'border border-border',
        'p-1',
        className
      )}
      role="radiogroup"
      aria-label="Chọn chế độ hiển thị"
    >
      {options.map(({ mode: optionMode, icon: Icon, label }) => (
        <button
          key={optionMode}
          type="button"
          role="radio"
          aria-checked={mode === optionMode}
          onClick={() => setMode(optionMode)}
          className={cn(
            'inline-flex items-center justify-center rounded-md',
            'transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
            sizeClasses[size],
            mode === optionMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-foreground-secondary hover:text-foreground'
          )}
          aria-label={label}
        >
          <Icon size={iconSizes[size]} />
        </button>
      ))}
    </div>
  );
}

/**
 * ThemeSelect Component
 * Dropdown select for theme mode
 */
export function ThemeSelect({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <select
      value={mode}
      onChange={(e) => setMode(e.target.value as ThemeMode)}
      className={cn(
        'px-3 py-2 rounded-lg',
        'bg-secondary border border-border',
        'text-foreground text-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
        'cursor-pointer',
        className
      )}
      aria-label="Chọn chế độ hiển thị"
    >
      <option value="light">Sáng</option>
      <option value="dark">Tối</option>
      <option value="system">Hệ thống</option>
    </select>
  );
}

export default ThemeToggle;
