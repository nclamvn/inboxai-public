/**
 * useTheme Hook
 * Re-export from ThemeContext for convenient imports
 */

export {
  useTheme,
  useIsDark,
  useThemeColors,
  useThemeShadows,
} from '@/contexts/theme-context';

export type {
  ThemeMode,
  ResolvedTheme,
} from '@/contexts/theme-context';
