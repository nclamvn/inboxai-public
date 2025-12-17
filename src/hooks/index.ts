/**
 * Hooks Index
 * Barrel export for all custom hooks
 */

// Theme
export {
  useTheme,
  useIsDark,
  useThemeColors,
  useThemeShadows,
} from './use-theme';
export type { ThemeMode, ResolvedTheme } from './use-theme';

// Media Query
export {
  useMediaQuery,
  useBreakpoint,
  useBreakpointDown,
  useCurrentBreakpoint,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  usePrefersReducedMotion,
  usePrefersColorScheme,
} from './use-media-query';

// Email
export { useEmails } from './use-emails';
export { useEmail } from './use-email';
export { useEmailBatch } from './use-email-batch';
export { useEmailsQuery } from './use-emails-query';

// AI Features
export { useAIFeatures } from './use-ai-features';

// User
export { useUser } from './use-user';

// Auto Sync
export { useAutoSync } from './use-auto-sync';

// Behavior
export { useBehaviorTracker } from './use-behavior-tracker';

// Haptics
export { useHaptic } from './use-haptic';

// Network Status
export { useNetworkStatus } from './use-network-status';
