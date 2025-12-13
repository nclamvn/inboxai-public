'use client';

import { useEffect } from 'react';
import {
  isNative,
  getPlatform,
  initAppLifecycle,
  removeAppLifecycleListeners,
  configureStatusBar,
  hideSplashScreen,
  setupAndroidBackButton,
  initKeyboard,
  setupKeyboardListeners,
  removeKeyboardListeners,
  setKeyboardTheme,
} from '@/lib/capacitor';

export function CapacitorInit() {
  useEffect(() => {
    const initCapacitor = async () => {
      if (!isNative()) return;

      const platform = getPlatform();
      console.log('[CapacitorInit] Initializing for platform:', platform);

      // Initialize app lifecycle listeners
      initAppLifecycle();

      // Setup Android back button handling
      if (platform === 'android') {
        setupAndroidBackButton();
      }

      // Initialize keyboard
      await initKeyboard();
      setupKeyboardListeners();

      // Configure status bar (dark mode by default)
      await configureStatusBar(true);

      // Hide splash screen after app is ready
      // Small delay to ensure web content is loaded
      setTimeout(async () => {
        await hideSplashScreen();
        console.log('[CapacitorInit] Splash screen hidden');
      }, 500);

      console.log('[CapacitorInit] Initialization complete');
    };

    initCapacitor();

    return () => {
      removeAppLifecycleListeners();
      removeKeyboardListeners();
    };
  }, []);

  return null;
}

/**
 * Hook to update native settings when theme changes
 * Use this in your theme provider or root layout
 */
export function useCapacitorTheme(isDark: boolean) {
  useEffect(() => {
    if (!isNative()) return;

    configureStatusBar(isDark);
    setKeyboardTheme(isDark);
  }, [isDark]);
}
