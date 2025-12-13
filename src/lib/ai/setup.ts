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
    console.log('[AI] Module already initialized');
    return;
  }

  console.log('[AI] Initializing AI module...');

  try {
    // Register all feature executors
    registerAllExecutors();

    // Verify runner has executors
    const runner = getAIFeatureRunner();
    const registeredFeatures = runner.getRegisteredFeatures();
    console.log('[AI] Registered features:', registeredFeatures);

    // Get allocation service instance
    const allocationService = getAIFeatureAllocationService();
    console.log('[AI] Allocation service ready');

    isInitialized = true;
    console.log('[AI] Module initialization complete');
  } catch (error) {
    console.error('[AI] Module initialization failed:', error);
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
