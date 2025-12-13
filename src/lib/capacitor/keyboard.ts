import { Keyboard, KeyboardStyle, KeyboardResize } from '@capacitor/keyboard';
import { isNative, getPlatform } from './index';

/**
 * Initialize keyboard settings
 */
export const initKeyboard = async () => {
  if (!isNative()) return;

  try {
    // Set keyboard style to match app theme (dark by default)
    await Keyboard.setStyle({ style: KeyboardStyle.Dark });

    // Set resize mode
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });

    // iOS specific: enable accessory bar
    if (getPlatform() === 'ios') {
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
    }
  } catch (error) {
    console.error('[Keyboard] Error initializing:', error);
  }
};

/**
 * Setup keyboard listeners
 */
export const setupKeyboardListeners = (
  onShow?: (height: number) => void,
  onHide?: () => void
) => {
  if (!isNative()) return;

  // iOS uses 'Will' events
  Keyboard.addListener('keyboardWillShow', (info) => {
    console.log('[Keyboard] Will show, height:', info.keyboardHeight);
    onShow?.(info.keyboardHeight);

    window.dispatchEvent(new CustomEvent('keyboard:show', {
      detail: { height: info.keyboardHeight }
    }));
  });

  Keyboard.addListener('keyboardWillHide', () => {
    console.log('[Keyboard] Will hide');
    onHide?.();

    window.dispatchEvent(new CustomEvent('keyboard:hide'));
  });

  // Android uses 'Did' events
  Keyboard.addListener('keyboardDidShow', (info) => {
    window.dispatchEvent(new CustomEvent('keyboard:show', {
      detail: { height: info.keyboardHeight }
    }));
  });

  Keyboard.addListener('keyboardDidHide', () => {
    window.dispatchEvent(new CustomEvent('keyboard:hide'));
  });
};

/**
 * Remove keyboard listeners
 */
export const removeKeyboardListeners = async () => {
  if (!isNative()) return;
  await Keyboard.removeAllListeners();
};

/**
 * Hide keyboard programmatically
 */
export const hideKeyboard = async () => {
  if (!isNative()) return;

  try {
    await Keyboard.hide();
  } catch (error) {
    console.error('[Keyboard] Error hiding:', error);
  }
};

/**
 * Show keyboard programmatically (may not work on all devices)
 */
export const showKeyboard = async () => {
  if (!isNative()) return;

  try {
    await Keyboard.show();
  } catch (error) {
    console.error('[Keyboard] Error showing:', error);
  }
};

/**
 * Set keyboard style based on theme
 */
export const setKeyboardTheme = async (isDark: boolean) => {
  if (!isNative()) return;

  try {
    await Keyboard.setStyle({
      style: isDark ? KeyboardStyle.Dark : KeyboardStyle.Light
    });
  } catch (error) {
    console.error('[Keyboard] Error setting style:', error);
  }
};

/**
 * Scroll to focused input when keyboard shows
 */
export const setScrollToInput = async (enabled: boolean) => {
  if (!isNative()) return;

  try {
    await Keyboard.setScroll({ isDisabled: !enabled });
  } catch (error) {
    console.error('[Keyboard] Error setting scroll:', error);
  }
};
