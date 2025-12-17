/**
 * Theme Context
 * Manages light/dark theme with system preference support
 */

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { lightColors, darkColors, getShadows } from '@/styles/design-tokens';

// Types
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// Color palette type (union of light and dark)
type ColorPalette = typeof lightColors | typeof darkColors;

interface ThemeContextValue {
  /** Current theme mode setting */
  mode: ThemeMode;
  /** Resolved theme (light or dark) */
  theme: ResolvedTheme;
  /** Alias for theme (backwards compatibility) */
  resolvedTheme: ResolvedTheme;
  /** Whether dark mode is active */
  isDark: boolean;
  /** Set theme mode */
  setMode: (mode: ThemeMode) => void;
  /** Set theme (alias for setMode) */
  setTheme: (mode: ThemeMode) => void;
  /** Toggle between light and dark */
  toggle: () => void;
  /** Toggle (alias) */
  toggleTheme: () => void;
  /** Current color palette */
  colors: ColorPalette;
  /** Current shadows */
  shadows: ReturnType<typeof getShadows>;
  /** Whether component is mounted */
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Storage key
const THEME_STORAGE_KEY = 'inboxai-theme-mode';

// Get system preference
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Get stored theme
function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  // Check both keys for backwards compatibility
  const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return null;
}

// Store theme
function storeTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  // Also store in legacy key for backwards compatibility
  localStorage.setItem('theme', mode);
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Default theme mode */
  defaultMode?: ThemeMode;
  /** Enable system preference detection */
  enableSystem?: boolean;
  /** Attribute to set on document element */
  attribute?: 'class' | 'data-theme';
}

export function ThemeProvider({
  children,
  defaultMode = 'system',
  enableSystem = true,
  attribute = 'class',
}: ThemeProviderProps) {
  const initRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Initialize mode from storage or default
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return defaultMode;
    const stored = getStoredTheme();
    return stored ?? defaultMode;
  });

  // Track system preference
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  // Resolve actual theme
  const theme: ResolvedTheme = useMemo(() => {
    if (mode === 'system' && enableSystem) {
      return systemTheme;
    }
    return mode === 'dark' ? 'dark' : 'light';
  }, [mode, systemTheme, enableSystem]);

  const isDark = theme === 'dark';

  // Get colors and shadows based on theme
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);
  const shadows = useMemo(() => getShadows(isDark), [isDark]);

  // Listen to system preference changes
  useEffect(() => {
    if (!enableSystem) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [enableSystem]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    if (attribute === 'class') {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    } else {
      root.setAttribute('data-theme', theme);
    }

    // Also set color-scheme for native elements
    root.style.colorScheme = theme;
  }, [theme, attribute]);

  // Initialize on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const stored = getStoredTheme();
    if (stored) {
      setModeState(stored);
    }
    setMounted(true);
  }, []);

  // Set mode handler
  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    storeTheme(newMode);
  }, []);

  // Toggle handler
  const toggle = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  // Context value
  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme,
      resolvedTheme: theme, // backwards compatibility
      isDark,
      setMode,
      setTheme: setMode, // backwards compatibility
      toggle,
      toggleTheme: toggle, // backwards compatibility
      colors,
      shadows,
      mounted,
    }),
    [mode, theme, isDark, setMode, toggle, colors, shadows, mounted]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme Hook
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * useIsDark Hook - Simple boolean for dark mode
 */
export function useIsDark(): boolean {
  const { isDark } = useTheme();
  return isDark;
}

/**
 * useThemeColors Hook - Get current colors
 */
export function useThemeColors() {
  const { colors } = useTheme();
  return colors;
}

/**
 * useThemeShadows Hook - Get current shadows
 */
export function useThemeShadows() {
  const { shadows } = useTheme();
  return shadows;
}

export default ThemeContext;
