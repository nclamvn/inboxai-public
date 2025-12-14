'use client';

/**
 * AI Features Panel
 * Unified component for Desktop + Mobile
 * With fallback mechanism and better error handling
 */

import { Loader2, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
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
  className?: string;
}

export function AIFeaturesPanel({
  emailId,
  className,
}: AIFeaturesPanelProps) {
  const {
    results,
    allocation,
    availableButtons,
    isLoading,
    error,
    source,
    triggerFeature,
    refresh,
  } = useAIFeatures(emailId);

  // DEBUG: Log state on every render
  console.log('[AIFeaturesPanel] === RENDER ===');
  console.log('[AIFeaturesPanel] emailId:', emailId);
  console.log('[AIFeaturesPanel] isLoading:', isLoading);
  console.log('[AIFeaturesPanel] error:', error);
  console.log('[AIFeaturesPanel] source:', source);
  console.log('[AIFeaturesPanel] results:', JSON.stringify(results));
  console.log('[AIFeaturesPanel] allocation:', allocation?.category);
  console.log('[AIFeaturesPanel] availableButtons:', availableButtons);

  // Initial loading state
  if (isLoading && Object.keys(results).length === 0) {
    console.log('[AIFeaturesPanel] → Rendering: LoadingSkeleton');
    return (
      <div className={cn('space-y-3', className)}>
        <LoadingSkeleton />
      </div>
    );
  }

  // Error state (all failed)
  if (error && Object.keys(results).length === 0) {
    console.log('[AIFeaturesPanel] → Rendering: Error state');
    return (
      <div className={cn(
        'rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4',
        className
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={refresh}
            className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Get successful features
  const successfulFeatures = Object.entries(results)
    .filter(([, r]) => r.status === 'success' && r.data)
    .map(([key, r]) => ({ featureKey: key as AIFeatureKey, data: r.data }));

  // Get loading features
  const loadingFeatures = Object.entries(results)
    .filter(([, r]) => r.status === 'loading')
    .map(([key]) => key as AIFeatureKey);

  // Don't render for spam
  if (allocation?.category === 'spam') {
    console.log('[AIFeaturesPanel] → Rendering: null (spam)');
    return null;
  }

  // No features available
  if (successfulFeatures.length === 0 && loadingFeatures.length === 0 && availableButtons.length === 0) {
    console.log('[AIFeaturesPanel] → Rendering: No features message');
    return (
      <div className={cn('text-center py-6 text-gray-500', className)}>
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Không có tính năng AI cho email này</p>
      </div>
    );
  }

  console.log('[AIFeaturesPanel] → Rendering: Full panel with', successfulFeatures.length, 'features');
  return (
    <div className={cn('space-y-3', className)}>
      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && source && (
        <div className="text-xs text-gray-400 flex items-center gap-2">
          <span>Source: {source}</span>
          {allocation && <span>| {allocation.category}</span>}
        </div>
      )}

      {/* VIP Sender & Content Triggers */}
      {(allocation?.isVipSender || (allocation?.contentTriggers?.length || 0) > 0) && (
        <div className="flex flex-wrap gap-2">
          {allocation?.isVipSender && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              VIP Sender
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

      {/* Loading Features */}
      {loadingFeatures.map(featureKey => (
        <FeatureLoadingCard key={featureKey} featureKey={featureKey} />
      ))}

      {/* Successful Features */}
      {successfulFeatures.map(({ featureKey, data }) => (
        <AIFeatureCard
          key={featureKey}
          featureKey={featureKey}
          title={AI_FEATURES_INFO.find(f => f.key === featureKey)?.name || featureKey}
          titleVi={AI_FEATURES_INFO.find(f => f.key === featureKey)?.nameVi}
        >
          {renderFeatureContent(featureKey, data)}
        </AIFeatureCard>
      ))}

      {/* Manual Trigger Buttons */}
      {availableButtons.length > 0 && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Tính năng AI khác</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableButtons.map(featureKey => (
              <AIFeatureButton
                key={featureKey}
                featureKey={featureKey}
                emailId={emailId}
                onTrigger={triggerFeature}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

// Loading card for individual feature
function FeatureLoadingCard({ featureKey }: { featureKey: AIFeatureKey }) {
  const info = AI_FEATURES_INFO.find(f => f.key === featureKey);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {info?.nameVi || featureKey}
          </span>
          <p className="text-xs text-gray-500">Đang xử lý...</p>
        </div>
      </div>
    </div>
  );
}

// Render feature content
function renderFeatureContent(featureKey: AIFeatureKey, data: unknown) {
  if (!data) {
    return <div className="text-sm text-gray-500">Không có dữ liệu</div>;
  }

  switch (featureKey) {
    case 'summary':
      return <AISummaryContent summary={data as string} />;
    case 'smart_reply':
      return <AISmartReplyContent replies={Array.isArray(data) ? data : []} />;
    case 'action_items':
      return <AIActionItemsContent items={Array.isArray(data) ? data : []} />;
    case 'follow_up':
      return <FollowUpContent data={data} />;
    case 'sentiment':
      return <SentimentContent data={data} />;
    default:
      return (
        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

// Follow-up content
function FollowUpContent({ data }: { data: unknown }) {
  const typedData = data as { needsFollowUp?: boolean; suggestedDate?: string; reason?: string };
  if (!typedData?.needsFollowUp) return <div className="text-sm text-gray-500">Không cần follow-up</div>;

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
        <span>Cần follow-up</span>
        {typedData.suggestedDate && <span className="text-gray-500">- {typedData.suggestedDate}</span>}
      </div>
      {typedData.reason && <p className="mt-1 text-gray-600 dark:text-gray-400">{typedData.reason}</p>}
    </div>
  );
}

// Sentiment content
function SentimentContent({ data }: { data: unknown }) {
  const typedData = data as { sentiment?: string; confidence?: number };
  const display = {
    positive: { emoji: 'Tích cực', color: 'text-green-500' },
    negative: { emoji: 'Tiêu cực', color: 'text-red-500' },
    neutral: { emoji: 'Trung tính', color: 'text-gray-500' },
  };

  const d = display[typedData?.sentiment as keyof typeof display] || display.neutral;

  return (
    <div className="text-sm">
      <div className={cn('font-medium', d.color)}>{d.emoji}</div>
      {typedData?.confidence && (
        <div className="text-xs text-gray-500 mt-1">
          Độ tin cậy: {Math.round(typedData.confidence * 100)}%
        </div>
      )}
    </div>
  );
}

export default AIFeaturesPanel;
