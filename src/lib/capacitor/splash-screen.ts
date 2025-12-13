import { SplashScreen } from '@capacitor/splash-screen';
import { isNative } from './index';

/**
 * Hide splash screen
 * Call this after app is ready
 */
export const hideSplashScreen = async () => {
  if (!isNative()) return;

  try {
    await SplashScreen.hide({
      fadeOutDuration: 300,
    });
  } catch (error) {
    console.error('[SplashScreen] Error hiding:', error);
  }
};

/**
 * Show splash screen
 * Useful for app transitions
 */
export const showSplashScreen = async () => {
  if (!isNative()) return;

  try {
    await SplashScreen.show({
      showDuration: 2000,
      autoHide: true,
      fadeInDuration: 300,
      fadeOutDuration: 300,
    });
  } catch (error) {
    console.error('[SplashScreen] Error showing:', error);
  }
};
