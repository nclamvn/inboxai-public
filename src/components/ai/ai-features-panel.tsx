'use client';

/**
 * AI Features Panel
 * Complete panel showing all AI features for an email
 */

import { useState, useEffect } from 'react';
import { Loader2, Sparkles, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIFeatureCard } from './ai-feature-card';
import { AIFeatureButton } from './ai-feature-button';
import { AISummaryContent } from './ai-summary-content';
import { AISmartReplyContent } from './ai-smart-reply-content';
import { AIActionItemsContent } from './ai-action-items-content';
import {
  AIFeatureKey,
  AI_FEATURES_INFO,
  TriggerType,
} from '@/types/ai-features';

interface FeatureState {
  featureKey: AIFeatureKey;
  isAutoEnabled: boolean;
  isButtonVisible: boolean;
  triggerReason: TriggerType | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  data: unknown;
  error?: string;
}

interface AIFeaturesPanelProps {
  emailId: string;
  category: string;
  priority: number;
  existingResults?: {
    summary?: string;
    smart_reply?: string[];
    action_items?: Array<{ task: string; deadline?: string; priority?: string }>;
    follow_up?: unknown;
    sentiment?: unknown;
  };
  onFeatureResult?: (featureKey: AIFeatureKey, result: unknown) => void;
  className?: string;
}

export function AIFeaturesPanel({
  emailId,
  category,
  priority,
  existingResults = {},
  onFeatureResult,
  className,
}: AIFeaturesPanelProps) {
  const [features, setFeatures] = useState<FeatureState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVipSender, setIsVipSender] = useState(false);
  const [contentTriggers, setContentTriggers] = useState<string[]>([]);
  const [collapsedFeatures, setCollapsedFeatures] = useState<Set<AIFeatureKey>>(new Set());

  // Fetch feature allocation on mount
  useEffect(() => {
    fetchFeatureAllocation();
  }, [emailId]);

  // Auto-trigger enabled features that don't have data yet
  useEffect(() => {
    const autoTriggerFeatures = async () => {
      for (const feature of features) {
        if (feature.isAutoEnabled && feature.status === 'idle') {
          // Mark as loading
          setFeatures(prev => prev.map(f =>
            f.featureKey === feature.featureKey
              ? { ...f, status: 'loading' as const }
              : f
          ));

          try {
            const response = await fetch(`/api/ai/features/${emailId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ featureKey: feature.featureKey }),
            });

            if (!response.ok) throw new Error('Failed to trigger feature');

            const data = await response.json();
            handleFeatureTrigger(feature.featureKey, data.result);
          } catch (error) {
            console.error(`Error auto-triggering ${feature.featureKey}:`, error);
            setFeatures(prev => prev.map(f =>
              f.featureKey === feature.featureKey
                ? { ...f, status: 'error' as const, error: 'Auto-trigger failed' }
                : f
            ));
          }
        }
      }
    };

    if (features.length > 0 && !isLoading) {
      autoTriggerFeatures();
    }
  }, [features.length, isLoading, emailId]);

  const fetchFeatureAllocation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ai/features/${emailId}`);
      if (!response.ok) throw new Error('Failed to fetch features');

      const data = await response.json();

      setIsVipSender(data.allocation?.isVipSender || false);
      setContentTriggers(data.allocation?.contentTriggers || []);

      // Initialize feature states
      const featureStates: FeatureState[] = (data.allocation?.features || []).map((f: {
        featureKey: AIFeatureKey;
        isAutoEnabled: boolean;
        isButtonVisible: boolean;
        triggerReason: TriggerType | null;
      }) => {
        const existingData = existingResults[f.featureKey as keyof typeof existingResults];
        return {
          featureKey: f.featureKey,
          isAutoEnabled: f.isAutoEnabled,
          isButtonVisible: f.isButtonVisible,
          triggerReason: f.triggerReason,
          status: existingData ? 'success' : 'idle',
          data: existingData || null,
        };
      });

      setFeatures(featureStates);
    } catch (error) {
      console.error('Error fetching feature allocation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeatureTrigger = (featureKey: AIFeatureKey, result: unknown) => {
    const typedResult = result as { success: boolean; data: unknown; error?: string };
    setFeatures(prev => prev.map(f => {
      if (f.featureKey === featureKey) {
        return {
          ...f,
          status: typedResult.success ? 'success' : 'error',
          data: typedResult.data,
          error: typedResult.error,
        };
      }
      return f;
    }));

    if (typedResult.success) {
      onFeatureResult?.(featureKey, typedResult.data);
    }
  };

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

  // Filter features to show
  const autoEnabledFeatures = features.filter(f => f.isAutoEnabled && (f.status === 'success' || f.status === 'loading'));
  const availableButtons = features.filter(f => f.isButtonVisible && !f.isAutoEnabled && f.status !== 'loading');

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Dang tai AI features...</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* VIP Sender & Content Triggers Badge */}
      {(isVipSender || contentTriggers.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {isVipSender && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              VIP Sender
            </span>
          )}
          {contentTriggers.map(trigger => (
            <span
              key={trigger}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
            >
              {trigger}
            </span>
          ))}
        </div>
      )}

      {/* Auto-enabled Features (Expanded) */}
      {autoEnabledFeatures.map(feature => (
        <AIFeatureCard
          key={feature.featureKey}
          featureKey={feature.featureKey}
          title={AI_FEATURES_INFO.find(f => f.key === feature.featureKey)?.name || feature.featureKey}
          titleVi={AI_FEATURES_INFO.find(f => f.key === feature.featureKey)?.nameVi}
          triggerReason={feature.triggerReason}
          isCollapsed={collapsedFeatures.has(feature.featureKey)}
          onToggleCollapse={() => toggleCollapse(feature.featureKey)}
        >
          {renderFeatureContent(feature)}
        </AIFeatureCard>
      ))}

      {/* Manual Trigger Buttons */}
      {availableButtons.length > 0 && (
        <div className="pt-2 border-t dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Tinh nang AI khac</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableButtons.map(feature => (
              <AIFeatureButton
                key={feature.featureKey}
                featureKey={feature.featureKey}
                emailId={emailId}
                onTrigger={handleFeatureTrigger}
                disabled={feature.status === 'loading'}
              />
            ))}
          </div>
        </div>
      )}

      {/* No features message */}
      {autoEnabledFeatures.length === 0 && availableButtons.length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Khong co tinh nang AI cho email nay</p>
          <p className="text-xs mt-1">({category} - Priority {priority})</p>
        </div>
      )}
    </div>
  );
}

// Helper function to render feature content
function renderFeatureContent(feature: FeatureState) {
  if (feature.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Đang xử lý...</span>
      </div>
    );
  }

  if (feature.status === 'error') {
    return (
      <div className="text-sm text-red-500">
        Lỗi: {feature.error || 'Không thể xử lý'}
      </div>
    );
  }

  if (!feature.data) {
    return (
      <div className="text-sm text-gray-500">
        Không có dữ liệu
      </div>
    );
  }

  switch (feature.featureKey) {
    case 'summary':
      return <AISummaryContent summary={feature.data as string} />;
    case 'smart_reply':
      return <AISmartReplyContent replies={feature.data as string[]} />;
    case 'action_items':
      return <AIActionItemsContent items={feature.data as Array<{ task: string; deadline?: string; priority?: 'high' | 'medium' | 'low' }>} />;
    case 'follow_up':
      return <AIFollowUpContent data={feature.data} />;
    case 'sentiment':
      return <AISentimentContent data={feature.data} />;
    default:
      return (
        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto">
          {JSON.stringify(feature.data, null, 2)}
        </pre>
      );
  }
}

// Simple content components
function AIFollowUpContent({ data }: { data: unknown }) {
  if (!data) return null;
  const typedData = data as { needsFollowUp?: boolean; suggestedDate?: string; reason?: string };
  return (
    <div className="text-sm">
      {typedData.needsFollowUp && (
        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
          <Bell className="w-4 h-4" />
          <span>Can follow-up</span>
          {typedData.suggestedDate && (
            <span className="text-gray-500">- {typedData.suggestedDate}</span>
          )}
        </div>
      )}
      {typedData.reason && (
        <p className="mt-1 text-gray-600 dark:text-gray-400">{typedData.reason}</p>
      )}
    </div>
  );
}

function AISentimentContent({ data }: { data: unknown }) {
  if (!data) return null;
  const typedData = data as { sentiment?: string; confidence?: number };

  const sentimentColors: Record<string, string> = {
    positive: 'text-green-500',
    negative: 'text-red-500',
    neutral: 'text-gray-500',
  };

  const sentiment = typedData.sentiment || 'neutral';

  return (
    <div className="text-sm">
      <div className={cn('font-medium', sentimentColors[sentiment] || 'text-gray-500')}>
        {sentiment === 'positive' ? 'Tich cuc' :
         sentiment === 'negative' ? 'Tieu cuc' : 'Trung tinh'}
      </div>
      {typedData.confidence && (
        <div className="text-xs text-gray-500 mt-1">
          Do tin cay: {Math.round(typedData.confidence * 100)}%
        </div>
      )}
    </div>
  );
}
