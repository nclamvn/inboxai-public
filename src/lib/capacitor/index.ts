import { Capacitor } from '@capacitor/core';

/**
 * Check if running in native app (iOS/Android)
 */
export const isNative = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Get current platform
 */
export const getPlatform = (): 'ios' | 'android' | 'web' => {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
};

/**
 * Check if plugin is available
 */
export const isPluginAvailable = (pluginName: string): boolean => {
  return Capacitor.isPluginAvailable(pluginName);
};

/**
 * Check if running on iOS
 */
export const isIOS = (): boolean => {
  return getPlatform() === 'ios';
};

/**
 * Check if running on Android
 */
export const isAndroid = (): boolean => {
  return getPlatform() === 'android';
};

/**
 * Check if running on web
 */
export const isWeb = (): boolean => {
  return getPlatform() === 'web';
};

// Re-export all capacitor utilities
export * from './app-lifecycle';
export * from './status-bar';
export * from './splash-screen';
export * from './haptics';
export * from './keyboard';
export * from './push-notifications';
export * from './android-back-button';
