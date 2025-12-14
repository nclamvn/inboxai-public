/**
 * useAIFeatures Hook
 * With fallback mechanism: Batch API → Individual calls
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AIFeatureKey } from '@/types/ai-features';

interface FeatureResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: unknown;
  error?: string;
}

interface AllocationInfo {
  category: string;
  priority: number;
  isVipSender: boolean;
  contentTriggers: string[];
}

interface UseAIFeaturesReturn {
  // Results
  results: Record<string, FeatureResult>;
  allocation: AllocationInfo | null;
  availableButtons: AIFeatureKey[];

  // State
  isLoading: boolean;
  error: string | null;
  source: 'batch' | 'individual' | 'cache' | null;

  // Actions
  triggerFeature: (featureKey: AIFeatureKey) => Promise<void>;
  refresh: () => void;
}

// Features to auto-load
const AUTO_FEATURES: AIFeatureKey[] = ['summary', 'smart_reply', 'action_items'];

// Timeout for batch API
const BATCH_TIMEOUT = 5000;

export function useAIFeatures(emailId: string | null): UseAIFeaturesReturn {
  const [results, setResults] = useState<Record<string, FeatureResult>>({});
  const [allocation, setAllocation] = useState<AllocationInfo | null>(null);
  const [availableButtons, setAvailableButtons] = useState<AIFeatureKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'batch' | 'individual' | 'cache' | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef<string | null>(null);

  // Fetch with timeout
  const fetchWithTimeout = useCallback(async (
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }, []);

  // Try Batch API
  const tryBatchAPI = useCallback(async (id: string): Promise<boolean> => {
    try {
      console.log('[useAIFeatures] Trying batch API for:', id);

      const response = await fetchWithTimeout(
        `/api/ai/features/${id}/auto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
        BATCH_TIMEOUT
      );

      if (!response.ok) {
        console.warn('[useAIFeatures] Batch API failed:', response.status);
        return false;
      }

      const data = await response.json();
      console.log('[useAIFeatures] Batch API success:', data);

      // Update state with batch results
      const newResults: Record<string, FeatureResult> = {};
      for (const [key, value] of Object.entries(data.results || {})) {
        const result = value as { status: string; data?: unknown; error?: string };
        newResults[key] = {
          status: result.status === 'success' ? 'success' : 'error',
          data: result.data,
          error: result.error,
        };
      }

      setResults(newResults);
      setAllocation(data.allocation || null);
      setAvailableButtons(data.availableButtons || []);
      setSource('batch');

      return true;
    } catch (err) {
      console.warn('[useAIFeatures] Batch API error:', err);
      return false;
    }
  }, [fetchWithTimeout]);

  // Fallback: Individual API calls
  const fallbackIndividualCalls = useCallback(async (id: string): Promise<void> => {
    console.log('[useAIFeatures] Falling back to individual calls');

    // Set loading state for each feature
    const loadingResults: Record<string, FeatureResult> = {};
    AUTO_FEATURES.forEach(key => {
      loadingResults[key] = { status: 'loading' };
    });
    setResults(loadingResults);

    // Fetch each feature in parallel
    const promises = AUTO_FEATURES.map(async (featureKey): Promise<[string, FeatureResult]> => {
      try {
        const response = await fetch(`/api/ai/features/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ featureKey }),
        });

        if (!response.ok) {
          return [featureKey, { status: 'error', error: `HTTP ${response.status}` }];
        }

        const data = await response.json();

        if (data.result?.success) {
          return [featureKey, { status: 'success', data: data.result.data }];
        } else {
          return [featureKey, { status: 'error', error: data.result?.error || 'Unknown error' }];
        }
      } catch (err) {
        return [featureKey, { status: 'error', error: String(err) }];
      }
    });

    const settledResults = await Promise.allSettled(promises);

    const finalResults: Record<string, FeatureResult> = {};
    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        const [key, value] = result.value;
        finalResults[key] = value;
      }
    }

    setResults(finalResults);
    setSource('individual');

    // Set available buttons for features that failed or weren't auto-enabled
    const failedFeatures = Object.entries(finalResults)
      .filter(([, r]) => r.status === 'error')
      .map(([k]) => k as AIFeatureKey);
    setAvailableButtons(failedFeatures);
  }, []);

  // Main load function
  const loadFeatures = useCallback(async (id: string) => {
    // Prevent duplicate loads
    if (hasLoadedRef.current === id) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    hasLoadedRef.current = id;

    try {
      // Try batch API first
      const batchSuccess = await tryBatchAPI(id);

      if (!batchSuccess) {
        // Fallback to individual calls
        await fallbackIndividualCalls(id);
      }
    } catch (err) {
      console.error('[useAIFeatures] Load error:', err);
      setError('Không thể tải AI features');
    } finally {
      setIsLoading(false);
    }
  }, [tryBatchAPI, fallbackIndividualCalls]);

  // Trigger a specific feature manually
  const triggerFeature = useCallback(async (featureKey: AIFeatureKey) => {
    if (!emailId) return;

    // Set loading for this feature
    setResults(prev => ({
      ...prev,
      [featureKey]: { status: 'loading' },
    }));

    try {
      const response = await fetch(`/api/ai/features/${emailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ featureKey }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.result?.success) {
        setResults(prev => ({
          ...prev,
          [featureKey]: { status: 'success', data: data.result.data },
        }));
        // Remove from available buttons
        setAvailableButtons(prev => prev.filter(k => k !== featureKey));
      } else {
        setResults(prev => ({
          ...prev,
          [featureKey]: { status: 'error', error: data.result?.error || 'Failed' },
        }));
      }
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [featureKey]: { status: 'error', error: String(err) },
      }));
    }
  }, [emailId]);

  // Refresh function
  const refresh = useCallback(() => {
    if (emailId) {
      hasLoadedRef.current = null;
      loadFeatures(emailId);
    }
  }, [emailId, loadFeatures]);

  // Load on mount or emailId change
  useEffect(() => {
    if (emailId) {
      loadFeatures(emailId);
    } else {
      // Reset state
      setResults({});
      setAllocation(null);
      setAvailableButtons([]);
      setError(null);
      setSource(null);
      hasLoadedRef.current = null;
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [emailId, loadFeatures]);

  return {
    results,
    allocation,
    availableButtons,
    isLoading,
    error,
    source,
    triggerFeature,
    refresh,
  };
}

export default useAIFeatures;
