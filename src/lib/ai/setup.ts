/**
 * AI Module Setup
 * Initialize AI feature system and register executors
 */

import { registerAllExecutors } from './feature-executors';
import { getAIFeatureRunner } from './feature-runner';
import { getAIFeatureAllocationService } from './feature-allocation';

let isInitialized = false;

/**
 * Initialize the AI module
 * Call this once at app startup (e.g., in instrumentation.ts or a layout)
 */
export async function initializeAIModule(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    // Register all feature executors
    registerAllExecutors();

    // Verify runner has executors
    const runner = getAIFeatureRunner();
    runner.getRegisteredFeatures();

    // Get allocation service instance
    getAIFeatureAllocationService();

    isInitialized = true;
  } catch (error) {
    throw error;
  }
}

/**
 * Check if AI module is initialized
 */
export function isAIModuleInitialized(): boolean {
  return isInitialized;
}

/**
 * Ensure AI module is initialized (for use in API routes)
 */
export async function ensureAIModuleInitialized(): Promise<void> {
  if (!isInitialized) {
    await initializeAIModule();
  }
}

/**
 * Get AI module status
 */
export function getAIModuleStatus(): {
  initialized: boolean;
  registeredFeatures: string[];
} {
  const runner = getAIFeatureRunner();
  return {
    initialized: isInitialized,
    registeredFeatures: runner.getRegisteredFeatures(),
  };
}

export default {
  initializeAIModule,
  isAIModuleInitialized,
  ensureAIModuleInitialized,
  getAIModuleStatus,
};
