import { App } from '@capacitor/app';
import { isNative, getPlatform } from './index';

/**
 * Handle Android back button behavior
 */
export const setupAndroidBackButton = () => {
  if (!isNative() || getPlatform() !== 'android') return;

  App.addListener('backButton', ({ canGoBack }) => {
    // If we can go back in history, do so
    if (canGoBack) {
      window.history.back();
    } else {
      // At root of app - minimize instead of exit
      App.minimizeApp();
    }
  });
};

/**
 * Exit the app (Android only)
 */
export const exitApp = async () => {
  if (!isNative() || getPlatform() !== 'android') return;
  await App.exitApp();
};

/**
 * Minimize the app (Android only)
 */
export const minimizeApp = async () => {
  if (!isNative() || getPlatform() !== 'android') return;
  await App.minimizeApp();
};

/**
 * Remove back button listener
 */
export const removeAndroidBackButtonListener = async () => {
  if (!isNative() || getPlatform() !== 'android') return;
  await App.removeAllListeners();
};
