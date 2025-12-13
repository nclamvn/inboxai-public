'use client';

/**
 * AI Feature Card
 * Collapsible card showing AI feature result (summary, actions, etc.)
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  FileText,
  MessageSquare,
  CheckSquare,
  Bell,
  Heart,
  Languages,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIFeatureKey, TriggerType, TRIGGER_DISPLAY } from '@/types/ai-features';

interface AIFeatureCardProps {
  featureKey: AIFeatureKey;
  title: string;
  titleVi?: string;
  isLoading?: boolean;
  isCollapsed?: boolean;
  triggerReason?: TriggerType | null;
  onToggleCollapse?: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  className?: string;
}

const FEATURE_ICONS: Record<AIFeatureKey, React.ElementType> = {
  classification: Sparkles,
  summary: FileText,
  smart_reply: MessageSquare,
  action_items: CheckSquare,
  follow_up: Bell,
  sentiment: Heart,
  translate: Languages,
};

const FEATURE_COLORS: Record<AIFeatureKey, string> = {
  classification: 'text-purple-500',
  summary: 'text-blue-500',
  smart_reply: 'text-green-500',
  action_items: 'text-orange-500',
  follow_up: 'text-yellow-500',
  sentiment: 'text-pink-500',
  translate: 'text-cyan-500',
};

export function AIFeatureCard({
  featureKey,
  title,
  titleVi,
  isLoading = false,
  isCollapsed: controlledCollapsed,
  triggerReason,
  onToggleCollapse,
  onDismiss,
  children,
  className,
}: AIFeatureCardProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const handleToggle = onToggleCollapse ?? (() => setInternalCollapsed(!internalCollapsed));

  const Icon = FEATURE_ICONS[featureKey] || Sparkles;
  const iconColor = FEATURE_COLORS[featureKey] || 'text-gray-500';

  const triggerInfo = triggerReason ? TRIGGER_DISPLAY[triggerReason] : null;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-all duration-200',
        'dark:border-gray-700 dark:bg-gray-800/50',
        'border-gray-200 bg-white',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 cursor-pointer',
          'hover:bg-gray-50 dark:hover:bg-gray-700/50',
          'rounded-t-lg',
          isCollapsed && 'rounded-b-lg'
        )}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-3">
          <div className={cn('p-1.5 rounded-md bg-gray-100 dark:bg-gray-700', iconColor)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {titleVi || title}
            </span>
            {triggerInfo && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  'bg-gray-100 dark:bg-gray-700',
                  'text-gray-600 dark:text-gray-400'
                )}
              >
                {triggerInfo.labelVi}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
          {onDismiss && !isLoading && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 pt-1 border-t dark:border-gray-700">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Dang xu ly...</span>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
