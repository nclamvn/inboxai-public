'use client';

/**
 * AI Feature Button
 * Button to manually trigger an AI feature
 */

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIFeatureKey, AI_FEATURES_INFO } from '@/types/ai-features';

interface AIFeatureButtonProps {
  featureKey: AIFeatureKey;
  emailId: string;
  onTrigger?: (featureKey: AIFeatureKey, result: unknown) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  showIcon?: boolean;
  className?: string;
}

export function AIFeatureButton({
  featureKey,
  emailId,
  onTrigger,
  disabled = false,
  size = 'sm',
  variant = 'outline',
  showIcon = true,
  className,
}: AIFeatureButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const featureInfo = AI_FEATURES_INFO.find(f => f.key === featureKey);
  if (!featureInfo) return null;

  const handleClick = async () => {
    if (isLoading || disabled) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/ai/features/${emailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger feature');
      }

      const data = await response.json();
      onTrigger?.(featureKey, data.result);
    } catch (error) {
      console.error('Error triggering AI feature:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base',
  };

  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: cn(
      'border bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800',
      'border-gray-300 dark:border-gray-600',
      'text-gray-700 dark:text-gray-300'
    ),
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading || disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : showIcon ? (
        <Sparkles className="w-3.5 h-3.5" />
      ) : null}
      <span>{featureInfo.nameVi}</span>
    </button>
  );
}
