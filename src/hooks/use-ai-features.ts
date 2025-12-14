/**
 * useAIFeatures Hook
 * SWR-based hook for fetching and caching AI features
 * Optimized: single batch API call + client-side caching
 */

'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import type { AIFeatureKey } from '@/types/ai-features';

interface FeatureResult {
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
  cost?: number;
  timeMs?: number;
  cached?: boolean;
}

interface AIFeaturesResponse {
  emailId: string;
  allocation: {
    category: string;
    priority: number;
    isVipSender: boolean;
    contentTriggers: string[];
  };
  results: Record<string, FeatureResult>;
  availableButtons: AIFeatureKey[];
  totalCost: number;
  totalTimeMs: number;
  cached: boolean;
}

interface UseAIFeaturesOptions {
  enabled?: boolean;
}

const fetcher = async (url: string): Promise<AIFeaturesResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch AI features');
  }

  return response.json();
};

export function useAIFeatures(
  emailId: string | null,
  options: UseAIFeaturesOptions = {}
) {
  const { enabled = true } = options;

  const { data, error, isLoading, mutate } = useSWR<AIFeaturesResponse>(
    enabled && emailId ? `/api/ai/features/${emailId}/auto` : null,
    fetcher,
    {
      revalidateOnFocus: false,      // Don't refetch when tab gains focus
      revalidateOnReconnect: false,  // Don't refetch when network reconnects
      dedupingInterval: 60000,       // Dedupe requests within 60 seconds
      errorRetryCount: 2,            // Retry failed requests twice
      errorRetryInterval: 1000,      // Wait 1 second between retries
    }
  );

  // Trigger a specific feature manually
  const triggerFeature = useCallback(async (featureKey: AIFeatureKey) => {
    if (!emailId) return null;

    try {
      const response = await fetch(`/api/ai/features/${emailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger feature');
      }

      const result = await response.json();

      // Update cache with new result
      mutate((current) => {
        if (!current) return current;
        return {
          ...current,
          results: {
            ...current.results,
            [featureKey]: {
              status: result.result?.success ? 'success' : 'error',
              data: result.result?.data,
              error: result.result?.error,
              cost: result.result?.cost || 0,
              timeMs: result.result?.processingTimeMs || 0,
            },
          },
          // Remove from available buttons if successful
          availableButtons: result.result?.success
            ? current.availableButtons.filter(k => k !== featureKey)
            : current.availableButtons,
        };
      }, false); // false = don't revalidate from server

      return result;
    } catch (error) {
      console.error('Error triggering feature:', error);
      return null;
    }
  }, [emailId, mutate]);

  // Refresh all features (force refetch)
  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  // Invalidate cache and refetch
  const invalidate = useCallback(() => {
    mutate(undefined, { revalidate: true });
  }, [mutate]);

  return {
    // Data
    data,
    results: data?.results || {},
    allocation: data?.allocation,
    availableButtons: data?.availableButtons || [],

    // State
    isLoading,
    error,
    isCached: data?.cached || false,

    // Actions
    triggerFeature,
    refresh,
    invalidate,
  };
}

export default useAIFeatures;
