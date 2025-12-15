'use client';

/**
 * useAIFeatures Hook - Fixed Version
 * Handles AI feature loading with proper abort handling
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { aiLogger } from '@/lib/logger';
import { AIFeatureKey } from '@/types/ai-features';

export interface AIFeatureResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: unknown;
  error?: string;
}

export interface AIAllocation {
  category: string;
  priority: number;
  isVipSender: boolean;
  contentTriggers: string[];
}

interface UseAIFeaturesReturn {
  results: Record<string, AIFeatureResult>;
  allocation: AIAllocation | null;
  availableButtons: AIFeatureKey[];
  isLoading: boolean;
  error: string | null;
  source: 'batch' | 'individual' | 'cache' | null;
  triggerFeature: (feature: AIFeatureKey) => Promise<void>;
  refresh: () => void;
}

// Constants
const BATCH_TIMEOUT = 30000; // 30 seconds
const INDIVIDUAL_TIMEOUT = 15000; // 15 seconds
const DEBOUNCE_DELAY = 100; // 100ms debounce

// Initial state
const initialResult: AIFeatureResult = { status: 'idle', data: null };

const initialResults: Record<string, AIFeatureResult> = {
  classification: { ...initialResult },
  summary: { ...initialResult },
  smart_reply: { ...initialResult },
  action_items: { ...initialResult },
  follow_up: { ...initialResult },
  sentiment: { ...initialResult },
  translate: { ...initialResult },
};

export function useAIFeatures(emailId: string | null): UseAIFeaturesReturn {
  const [results, setResults] = useState<Record<string, AIFeatureResult>>(initialResults);
  const [allocation, setAllocation] = useState<AIAllocation | null>(null);
  const [availableButtons, setAvailableButtons] = useState<AIFeatureKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'batch' | 'individual' | 'cache' | null>(null);

  // Track loaded emails to prevent duplicate fetches
  const loadedEmailsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset when emailId changes - IMMEDIATE
  useEffect(() => {
    if (emailId && !loadedEmailsRef.current.has(emailId)) {
      // Immediately clear old data
      setResults(initialResults);
      setAllocation(null);
      setAvailableButtons([]);
      setError(null);
      setSource(null);
    }
  }, [emailId]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Fetch with timeout helper
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

  // Load features for email
  const loadFeatures = useCallback(async (id: string) => {
    // Skip if already loaded
    if (loadedEmailsRef.current.has(id)) {
      aiLogger.debug('[useAIFeatures] Already loaded, skipping:', id);
      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    // Set main features to loading
    setResults(prev => ({
      ...prev,
      summary: { status: 'loading', data: null },
      smart_reply: { status: 'loading', data: null },
      action_items: { status: 'loading', data: null },
    }));

    aiLogger.debug('[useAIFeatures] Loading features for:', id);

    try {
      // Try batch API first
      const response = await fetchWithTimeout(
        `/api/ai/features/${id}/auto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
        BATCH_TIMEOUT
      );

      // Check if component still mounted
      if (!isMountedRef.current) return;

      if (!response.ok) {
        const errorText = await response.text();
        aiLogger.warn('[useAIFeatures] API error:', response.status, errorText.slice(0, 200));
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      aiLogger.debug('[useAIFeatures] Batch API response received');

      // Check if component still mounted
      if (!isMountedRef.current) return;

      // Process results from batch API
      const newResults: Record<string, AIFeatureResult> = { ...initialResults };

      // Process results object from API
      if (data.results) {
        for (const [key, value] of Object.entries(data.results)) {
          const result = value as { status: string; data?: unknown; error?: string };
          newResults[key] = {
            status: result.status === 'success' ? 'success' : result.status === 'error' ? 'error' : 'idle',
            data: result.data || null,
            error: result.error,
          };
        }
      }

      // Also check top-level data (backwards compatibility)
      if (data.summary && !newResults.summary.data) {
        newResults.summary = {
          status: 'success',
          data: typeof data.summary === 'string' ? data.summary : data.summary,
        };
      }

      if ((data.smart_reply || data.smartReplies || data.replies) && !newResults.smart_reply.data) {
        const replies = data.smart_reply || data.smartReplies || data.replies;
        newResults.smart_reply = {
          status: 'success',
          data: Array.isArray(replies) ? replies : replies?.replies || [],
        };
      }

      if ((data.action_items || data.actionItems || data.actions) && !newResults.action_items.data) {
        const actions = data.action_items || data.actionItems || data.actions;
        newResults.action_items = {
          status: 'success',
          data: Array.isArray(actions) ? actions : actions?.items || [],
        };
      }

      // Update allocation
      if (data.allocation) {
        setAllocation(data.allocation);
      }

      // Update available buttons
      if (data.availableButtons) {
        setAvailableButtons(data.availableButtons);
      }

      // Check if we got any data
      const hasData = newResults.summary.data ||
                      (Array.isArray(newResults.smart_reply.data) && newResults.smart_reply.data.length > 0) ||
                      (Array.isArray(newResults.action_items.data) && newResults.action_items.data.length > 0);

      if (!hasData) {
        aiLogger.warn('[useAIFeatures] No AI data returned for:', id);
      } else {
        aiLogger.debug('[useAIFeatures] Features loaded successfully');
      }

      setResults(newResults);
      setSource(data.cached ? 'cache' : 'batch');
      loadedEmailsRef.current.add(id);
      setIsLoading(false);

    } catch (err) {
      // Check if it's an abort error (user navigated away)
      if (err instanceof Error && err.name === 'AbortError') {
        aiLogger.debug('[useAIFeatures] Request aborted (expected on navigation)');
        return;
      }

      // Check if component still mounted
      if (!isMountedRef.current) return;

      aiLogger.error('[useAIFeatures] Failed to load features:', err instanceof Error ? err.message : 'Unknown error');

      // Set error state
      setError(err instanceof Error ? err.message : 'Failed to load AI features');

      // Mark main features as error
      setResults(prev => ({
        ...prev,
        summary: { status: 'error', data: null, error: 'Failed to load' },
        smart_reply: { status: 'error', data: null, error: 'Failed to load' },
        action_items: { status: 'error', data: null, error: 'Failed to load' },
      }));

      setIsLoading(false);
    }
  }, [fetchWithTimeout]);

  // Trigger individual feature
  const triggerFeature = useCallback(async (feature: AIFeatureKey) => {
    if (!emailId) return;

    setResults(prev => ({
      ...prev,
      [feature]: { status: 'loading', data: null },
    }));

    try {
      const response = await fetchWithTimeout(
        `/api/ai/features/${emailId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ featureKey: feature }),
        },
        INDIVIDUAL_TIMEOUT
      );

      if (!isMountedRef.current) return;

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (data.result?.success) {
        setResults(prev => ({
          ...prev,
          [feature]: { status: 'success', data: data.result.data },
        }));
        // Remove from available buttons
        setAvailableButtons(prev => prev.filter(k => k !== feature));
      } else {
        throw new Error(data.result?.error || 'Unknown error');
      }

    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;

      aiLogger.error(`[useAIFeatures] Failed to trigger ${feature}:`, err);

      setResults(prev => ({
        ...prev,
        [feature]: {
          status: 'error',
          data: null,
          error: err instanceof Error ? err.message : 'Failed'
        },
      }));
    }
  }, [emailId, fetchWithTimeout]);

  // Refresh all features
  const refresh = useCallback(() => {
    if (emailId) {
      loadedEmailsRef.current.delete(emailId);
      loadFeatures(emailId);
    }
  }, [emailId, loadFeatures]);

  // Load on emailId change with debounce
  useEffect(() => {
    if (emailId && !loadedEmailsRef.current.has(emailId)) {
      // Clear any existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce to prevent rapid successive calls (StrictMode, fast navigation)
      debounceTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && !loadedEmailsRef.current.has(emailId)) {
          loadFeatures(emailId);
        }
      }, DEBOUNCE_DELAY);

      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }
  }, [emailId, loadFeatures]);

  // Memoize return value
  return useMemo(() => ({
    results,
    allocation,
    availableButtons,
    isLoading,
    error,
    source,
    triggerFeature,
    refresh,
  }), [results, allocation, availableButtons, isLoading, error, source, triggerFeature, refresh]);
}

export default useAIFeatures;
