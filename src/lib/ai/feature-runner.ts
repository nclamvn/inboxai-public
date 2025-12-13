/**
 * AI Feature Runner
 * Executes AI features based on allocation
 */

import {
  AIFeatureKey,
  AllocationResult,
  TriggerType,
  getAIFeatureAllocationService,
  FEATURE_COSTS,
} from './feature-allocation';

// ===========================================
// TYPES
// ===========================================

export interface FeatureResult<T = unknown> {
  featureKey: AIFeatureKey;
  success: boolean;
  data: T | null;
  error?: string;
  cost: number;
  processingTimeMs: number;
}

export interface RunFeaturesResult {
  emailId: string;
  results: FeatureResult[];
  totalCost: number;
  totalTimeMs: number;
}

// ===========================================
// FEATURE EXECUTOR INTERFACE
// ===========================================

export interface FeatureExecutor<T = unknown> {
  execute(emailId: string, emailData: Record<string, unknown>): Promise<T>;
}

// ===========================================
// FEATURE RUNNER CLASS
// ===========================================

export class AIFeatureRunner {
  private executors: Map<AIFeatureKey, FeatureExecutor> = new Map();

  /**
   * Register a feature executor
   */
  registerExecutor(featureKey: AIFeatureKey, executor: FeatureExecutor): void {
    this.executors.set(featureKey, executor);
  }

  /**
   * Run all auto-enabled features for an email
   */
  async runAutoFeatures(
    userId: string,
    emailId: string,
    emailData: Record<string, unknown>,
    allocation: AllocationResult
  ): Promise<RunFeaturesResult> {
    const results: FeatureResult[] = [];
    const service = getAIFeatureAllocationService();

    for (const feature of allocation.features) {
      if (!feature.isAutoEnabled) continue;

      const executor = this.executors.get(feature.featureKey);
      if (!executor) {
        console.warn(`No executor registered for feature: ${feature.featureKey}`);
        continue;
      }

      const startTime = Date.now();
      let result: FeatureResult;

      try {
        const data = await executor.execute(emailId, emailData);
        const processingTimeMs = Date.now() - startTime;

        result = {
          featureKey: feature.featureKey,
          success: true,
          data,
          cost: feature.estimatedCost,
          processingTimeMs,
        };

        // Log usage
        await service.logFeatureUsage(
          userId,
          emailId,
          feature.featureKey,
          feature.triggerReason || 'auto_default',
          feature.triggerReason,
          feature.estimatedCost,
          0,
          processingTimeMs
        );

      } catch (error) {
        const processingTimeMs = Date.now() - startTime;

        result = {
          featureKey: feature.featureKey,
          success: false,
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          cost: 0, // Don't charge for failed features
          processingTimeMs,
        };
      }

      results.push(result);
    }

    return {
      emailId,
      results,
      totalCost: results.reduce((sum, r) => sum + r.cost, 0),
      totalTimeMs: results.reduce((sum, r) => sum + r.processingTimeMs, 0),
    };
  }

  /**
   * Run a single feature manually (user clicked button)
   */
  async runManualFeature(
    userId: string,
    emailId: string,
    emailData: Record<string, unknown>,
    featureKey: AIFeatureKey
  ): Promise<FeatureResult> {
    const executor = this.executors.get(featureKey);
    if (!executor) {
      return {
        featureKey,
        success: false,
        data: null,
        error: `No executor registered for feature: ${featureKey}`,
        cost: 0,
        processingTimeMs: 0,
      };
    }

    const service = getAIFeatureAllocationService();
    const startTime = Date.now();

    try {
      const data = await executor.execute(emailId, emailData);
      const processingTimeMs = Date.now() - startTime;
      const cost = FEATURE_COSTS[featureKey];

      // Log usage as manual
      await service.logFeatureUsage(
        userId,
        emailId,
        featureKey,
        'manual',
        'user_requested',
        cost,
        0,
        processingTimeMs
      );

      return {
        featureKey,
        success: true,
        data,
        cost,
        processingTimeMs,
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      return {
        featureKey,
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        cost: 0,
        processingTimeMs,
      };
    }
  }

  /**
   * Check if a feature has an executor registered
   */
  hasExecutor(featureKey: AIFeatureKey): boolean {
    return this.executors.has(featureKey);
  }

  /**
   * Get all registered feature keys
   */
  getRegisteredFeatures(): AIFeatureKey[] {
    return Array.from(this.executors.keys());
  }
}

// ===========================================
// SINGLETON INSTANCE
// ===========================================

let runnerInstance: AIFeatureRunner | null = null;

export function getAIFeatureRunner(): AIFeatureRunner {
  if (!runnerInstance) {
    runnerInstance = new AIFeatureRunner();
  }
  return runnerInstance;
}

// ===========================================
// EXAMPLE: Register executors
// ===========================================

/*
// In your app initialization (e.g., src/lib/ai/setup.ts):

import { getAIFeatureRunner } from './feature-runner';
import { generateSummary } from './summarizer';
import { generateSmartReply } from './smart-reply';
import { extractActionItems } from './action-extractor';

const runner = getAIFeatureRunner();

runner.registerExecutor('summary', {
  async execute(emailId, emailData) {
    return generateSummary(emailData.subject as string, emailData.body_text as string);
  }
});

runner.registerExecutor('smart_reply', {
  async execute(emailId, emailData) {
    return generateSmartReply(emailData);
  }
});

runner.registerExecutor('action_items', {
  async execute(emailId, emailData) {
    return extractActionItems(emailData.body_text as string);
  }
});
*/

export default {
  AIFeatureRunner,
  getAIFeatureRunner,
};
