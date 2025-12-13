import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative, getPlatform } from './index';

/**
 * Configure status bar for iOS/Android
 */
export const configureStatusBar = async (isDarkMode: boolean = true) => {
  if (!isNative()) return;

  try {
    // Set style based on theme
    await StatusBar.setStyle({
      style: isDarkMode ? Style.Dark : Style.Light,
    });

    // Android specific: set background color
    if (getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({
        color: isDarkMode ? '#000000' : '#FFFFFF',
      });
    }
  } catch (error) {
    console.error('[StatusBar] Error configuring:', error);
  }
};

/**
 * Hide status bar (for fullscreen views)
 */
export const hideStatusBar = async () => {
  if (!isNative()) return;

  try {
    await StatusBar.hide();
  } catch (error) {
    console.error('[StatusBar] Error hiding:', error);
  }
};

/**
 * Show status bar
 */
export const showStatusBar = async () => {
  if (!isNative()) return;

  try {
    await StatusBar.show();
  } catch (error) {
    console.error('[StatusBar] Error showing:', error);
  }
};

/**
 * Set status bar overlay (Android only)
 */
export const setStatusBarOverlay = async (overlay: boolean) => {
  if (!isNative() || getPlatform() !== 'android') return;

  try {
    await StatusBar.setOverlaysWebView({ overlay });
  } catch (error) {
    console.error('[StatusBar] Error setting overlay:', error);
  }
};
