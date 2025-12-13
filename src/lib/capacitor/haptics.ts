import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './index';

/**
 * Light haptic feedback - for subtle interactions
 * Use for: toggles, selections, minor actions
 */
export const hapticLight = async () => {
  if (!isNative()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (error) {
    console.error('[Haptics] Light error:', error);
  }
};

/**
 * Medium haptic feedback - for standard interactions
 * Use for: button presses, confirmations
 */
export const hapticMedium = async () => {
  if (!isNative()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (error) {
    console.error('[Haptics] Medium error:', error);
  }
};

/**
 * Heavy haptic feedback - for significant actions
 * Use for: delete, archive, important actions
 */
export const hapticHeavy = async () => {
  if (!isNative()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch (error) {
    console.error('[Haptics] Heavy error:', error);
  }
};

/**
 * Success haptic feedback
 * Use for: successful operations, confirmations
 */
export const hapticSuccess = async () => {
  if (!isNative()) return;

  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch (error) {
    console.error('[Haptics] Success error:', error);
  }
};

/**
 * Warning haptic feedback
 * Use for: warnings, alerts
 */
export const hapticWarning = async () => {
  if (!isNative()) return;

  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch (error) {
    console.error('[Haptics] Warning error:', error);
  }
};

/**
 * Error haptic feedback
 * Use for: errors, failed operations
 */
export const hapticError = async () => {
  if (!isNative()) return;

  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch (error) {
    console.error('[Haptics] Error error:', error);
  }
};

/**
 * Selection changed haptic
 * Use for: picker changes, slider movements
 */
export const hapticSelection = async () => {
  if (!isNative()) return;

  try {
    await Haptics.selectionChanged();
  } catch (error) {
    console.error('[Haptics] Selection error:', error);
  }
};

/**
 * Vibrate for specified duration (Android only)
 * Use for: custom vibration patterns
 */
export const vibrate = async (duration: number = 300) => {
  if (!isNative()) return;

  try {
    await Haptics.vibrate({ duration });
  } catch (error) {
    console.error('[Haptics] Vibrate error:', error);
  }
};
