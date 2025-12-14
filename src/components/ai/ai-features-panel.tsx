'use client';

/**
 * AI Features Panel
 * Optimized with SWR caching and batch API
 * Single API call + client-side caching
 */

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIFeatures } from '@/hooks/use-ai-features';
import { AIFeatureCard } from './ai-feature-card';
import { AIFeatureButton } from './ai-feature-button';
import { AISummaryContent } from './ai-summary-content';
import { AISmartReplyContent } from './ai-smart-reply-content';
import { AIActionItemsContent } from './ai-action-items-content';
import {
  AIFeatureKey,
  AI_FEATURES_INFO,
} from '@/types/ai-features';

interface AIFeaturesPanelProps {
  emailId: string;
  category?: string;
  priority?: number;
  onFeatureResult?: (featureKey: AIFeatureKey, result: unknown) => void;
  className?: string;
}

export function AIFeaturesPanel({
  emailId,
  category,
  priority,
  onFeatureResult,
  className,
}: AIFeaturesPanelProps) {
  const [collapsedFeatures, setCollapsedFeatures] = useState<Set<AIFeatureKey>>(new Set());

  const {
    results,
    allocation,
    availableButtons,
    isLoading,
    error,
    isCached,
    triggerFeature,
  } = useAIFeatures(emailId);

  const toggleCollapse = (featureKey: AIFeatureKey) => {
    setCollapsedFeatures(prev => {
      const next = new Set(prev);
      if (next.has(featureKey)) {
        next.delete(featureKey);
      } else {
        next.add(featureKey);
      }
      return next;
    });
  };

  const handleTriggerFeature = async (featureKey: AIFeatureKey) => {
    const result = await triggerFeature(featureKey);
    if (result?.result?.success) {
      onFeatureResult?.(featureKey, result.result.data);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Đang xử lý AI...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('text-center py-6 text-red-500', className)}>
        <p className="text-sm">Không thể tải AI features</p>
      </div>
    );
  }

  // Get successful results
  const successfulFeatures = Object.entries(results)
    .filter(([, result]) => result.status === 'success' && result.data)
    .map(([key, result]) => ({
      featureKey: key as AIFeatureKey,
      data: result.data,
      cached: result.cached,
    }));

  // Effective category (from allocation or props)
  const effectiveCategory = allocation?.category || category || 'personal';

  // Don't show anything for spam
  if (effectiveCategory === 'spam') {
    return null;
  }

  // No features available
  if (successfulFeatures.length === 0 && availableButtons.length === 0) {
    return (
      <div className={cn('text-center py-6 text-gray-500', className)}>
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Không có tính năng AI cho email này</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* VIP Sender & Content Triggers Badge */}
      {(allocation?.isVipSender || (allocation?.contentTriggers?.length || 0) > 0) && (
        <div className="flex flex-wrap gap-2">
          {allocation?.isVipSender && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              ⭐ VIP Sender
            </span>
          )}
          {allocation?.contentTriggers?.map(trigger => (
            <span
              key={trigger}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
            >
              {trigger}
            </span>
          ))}
        </div>
      )}

      {/* Cached indicator (dev only) */}
      {isCached && process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-400">📦 Cached</div>
      )}

      {/* Successful Features */}
      {successfulFeatures.map(({ featureKey, data }) => (
        <AIFeatureCard
          key={featureKey}
          featureKey={featureKey}
          title={AI_FEATURES_INFO.find(f => f.key === featureKey)?.name || featureKey}
          titleVi={AI_FEATURES_INFO.find(f => f.key === featureKey)?.nameVi}
          isCollapsed={collapsedFeatures.has(featureKey)}
          onToggleCollapse={() => toggleCollapse(featureKey)}
        >
          {renderFeatureContent(featureKey, data)}
        </AIFeatureCard>
      ))}

      {/* Manual Trigger Buttons */}
      {availableButtons.length > 0 && (
        <div className="pt-2 border-t dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Tính năng AI khác</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableButtons.map(featureKey => (
              <AIFeatureButton
                key={featureKey}
                featureKey={featureKey}
                emailId={emailId}
                onTrigger={handleTriggerFeature}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to render feature content
function renderFeatureContent(featureKey: AIFeatureKey, data: unknown) {
  if (!data) {
    return <div className="text-sm text-gray-500">Không có dữ liệu</div>;
  }

  switch (featureKey) {
    case 'summary':
      return <AISummaryContent summary={data as string} />;
    case 'smart_reply':
      return <AISmartReplyContent replies={data as string[]} />;
    case 'action_items':
      return <AIActionItemsContent items={data as Array<{ task: string; deadline?: string; priority?: 'high' | 'medium' | 'low' }>} />;
    case 'follow_up':
      return <AIFollowUpContent data={data} />;
    case 'sentiment':
      return <AISentimentContent data={data} />;
    default:
      return (
        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

// Simple content components
function AIFollowUpContent({ data }: { data: unknown }) {
  if (!data) return null;
  const typedData = data as { needsFollowUp?: boolean; suggestedDate?: string; reason?: string };

  if (!typedData.needsFollowUp) return null;

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
        <span>⏰ Cần follow-up</span>
        {typedData.suggestedDate && (
          <span className="text-gray-500">- {typedData.suggestedDate}</span>
        )}
      </div>
      {typedData.reason && (
        <p className="mt-1 text-gray-600 dark:text-gray-400">{typedData.reason}</p>
      )}
    </div>
  );
}

function AISentimentContent({ data }: { data: unknown }) {
  if (!data) return null;
  const typedData = data as { sentiment?: string; confidence?: number };

  const sentimentDisplay = {
    positive: { emoji: '😊', label: 'Tích cực', color: 'text-green-500' },
    negative: { emoji: '😞', label: 'Tiêu cực', color: 'text-red-500' },
    neutral: { emoji: '😐', label: 'Trung tính', color: 'text-gray-500' },
  };

  const display = sentimentDisplay[typedData.sentiment as keyof typeof sentimentDisplay] || sentimentDisplay.neutral;

  return (
    <div className="text-sm">
      <div className={cn('font-medium', display.color)}>
        {display.emoji} {display.label}
      </div>
      {typedData.confidence && (
        <div className="text-xs text-gray-500 mt-1">
          Độ tin cậy: {Math.round(typedData.confidence * 100)}%
        </div>
      )}
    </div>
  );
}

export default AIFeaturesPanel;
