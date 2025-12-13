import { App } from '@capacitor/app';
import { isNative } from './index';

/**
 * Initialize app lifecycle listeners
 * Call this in root layout or _app.tsx
 */
export const initAppLifecycle = () => {
  if (!isNative()) return;

  // Handle app state changes
  App.addListener('appStateChange', ({ isActive }) => {
    console.log('[Capacitor] App state changed. Is active?', isActive);

    if (isActive) {
      // App came to foreground - refresh data if needed
      window.dispatchEvent(new CustomEvent('app:resume'));
    } else {
      // App went to background
      window.dispatchEvent(new CustomEvent('app:pause'));
    }
  });

  // Handle back button (Android)
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // Minimize app instead of closing
      App.minimizeApp();
    }
  });

  // Handle deep links
  App.addListener('appUrlOpen', ({ url }) => {
    console.log('[Capacitor] App opened with URL:', url);
    window.dispatchEvent(new CustomEvent('app:deeplink', { detail: { url } }));

    // Parse and navigate to the path
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path && path !== '/') {
        window.location.href = path;
      }
    } catch (e) {
      console.error('[Capacitor] Failed to parse deep link URL:', e);
    }
  });
};

/**
 * Remove all listeners (call on cleanup)
 */
export const removeAppLifecycleListeners = async () => {
  if (!isNative()) return;
  await App.removeAllListeners();
};

/**
 * Get app info
 */
export const getAppInfo = async () => {
  if (!isNative()) return null;

  try {
    const info = await App.getInfo();
    return info;
  } catch (e) {
    console.error('[Capacitor] Failed to get app info:', e);
    return null;
  }
};
