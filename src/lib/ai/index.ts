/**
 * AI Module Exports
 * Central export file for all AI-related functionality
 */

// Vietnamese Classifier
export * from './prompts/vietnamese-classifier';
export * from './vietnamese-utils';
export * from './vietnamese-entities';
export * from './vietnamese-classifier-integration';

// Re-export commonly used functions
export {
  // Prompts
  VIETNAMESE_SYSTEM_PROMPT,
  VIETNAMESE_EXAMPLES,
  buildClassificationPrompt,
  buildFewShotPrompt,
} from './prompts/vietnamese-classifier';

export {
  // Utils
  normalizeVietnameseText,
  expandAbbreviations,
  isVietnamese,
  getLanguageConfidence,
  cleanEmailBody,
  preprocessEmail,
  detectFormality,
} from './vietnamese-utils';

export {
  // Entities
  detectEntities,
  detectBanks,
  detectEWallets,
  detectMoneyAmounts,
  detectPhoneNumbers,
  extractAllEntities,
  identifySenderEntity,
  VIETNAMESE_BANKS,
  VIETNAMESE_EWALLETS,
  VIETNAMESE_ECOMMERCE,
} from './vietnamese-entities';

export {
  // Integration
  analyzeEmailContext,
  buildVietnameseClassificationPrompt,
  classifyVietnameseEmail,
  tryRuleBasedClassification,
} from './vietnamese-classifier-integration';

// Types
export type {
  ClassificationExample,
} from './prompts/vietnamese-classifier';

export type {
  PreprocessedEmail,
} from './vietnamese-utils';

export type {
  DetectedEntity,
  ExtractedEntities,
  MoneyAmount,
  PhoneNumber,
  BankInfo,
  EWalletInfo,
  ECommerceInfo,
} from './vietnamese-entities';

export type {
  VietnameseClassificationInput,
  VietnameseClassificationContext,
  VietnameseClassificationResult,
} from './vietnamese-classifier-integration';

// ===========================================
// Smart AI Features Allocation
// ===========================================

// Feature Allocation
export {
  AIFeatureAllocationService,
  getAIFeatureAllocationService,
  FEATURE_COSTS,
} from './feature-allocation';

export type {
  AllocationResult,
  FeatureAllocation,
} from './feature-allocation';

// Feature Runner
export {
  AIFeatureRunner,
  getAIFeatureRunner,
} from './feature-runner';

export type {
  FeatureResult,
  RunFeaturesResult,
  FeatureExecutor,
} from './feature-runner';

// Feature Executors
export {
  registerAllExecutors,
  executorMap,
  summaryExecutor,
  smartReplyExecutor,
  actionItemsExecutor,
  followUpExecutor,
  sentimentExecutor,
  translatorExecutor,
} from './feature-executors';

// Setup
export {
  initializeAIModule,
  isAIModuleInitialized,
  ensureAIModuleInitialized,
  getAIModuleStatus,
} from './setup';
