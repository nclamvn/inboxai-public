import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { isNative } from './index';

/**
 * Initialize push notifications
 * Call this after user logs in
 */
export const initPushNotifications = async (): Promise<string | null> => {
  if (!isNative()) {
    console.log('[Push] Not available on web');
    return null;
  }

  try {
    // Request permission
    const permission = await PushNotifications.requestPermissions();

    if (permission.receive !== 'granted') {
      console.log('[Push] Permission denied');
      return null;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Return token via promise
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token: Token) => {
        console.log('[Push] Registration success, token:', token.value);
        resolve(token.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('[Push] Registration error:', error);
        resolve(null);
      });
    });
  } catch (error) {
    console.error('[Push] Error initializing:', error);
    return null;
  }
};

/**
 * Setup push notification listeners
 */
export const setupPushListeners = (
  onNotificationReceived?: (notification: PushNotificationSchema) => void,
  onNotificationTapped?: (notification: ActionPerformed) => void
) => {
  if (!isNative()) return;

  // Notification received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] Notification received:', notification);
    onNotificationReceived?.(notification);
  });

  // User tapped on notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[Push] Notification action performed:', action);
    onNotificationTapped?.(action);

    // Handle deep link from notification data
    const data = action.notification.data;
    if (data?.emailId) {
      // Navigate to email detail
      window.location.href = `/inbox/${data.emailId}`;
    } else if (data?.url) {
      window.location.href = data.url;
    }
  });
};

/**
 * Remove all push notification listeners
 */
export const removePushListeners = async () => {
  if (!isNative()) return;
  await PushNotifications.removeAllListeners();
};

/**
 * Get current delivered notifications
 */
export const getDeliveredNotifications = async () => {
  if (!isNative()) return [];

  const { notifications } = await PushNotifications.getDeliveredNotifications();
  return notifications;
};

/**
 * Remove specific delivered notifications
 */
export const removeDeliveredNotifications = async (notificationIds: string[]) => {
  if (!isNative()) return;

  await PushNotifications.removeDeliveredNotifications({
    notifications: notificationIds.map(id => ({ id }))
  });
};

/**
 * Remove all delivered notifications
 */
export const removeAllDeliveredNotifications = async () => {
  if (!isNative()) return;
  await PushNotifications.removeAllDeliveredNotifications();
};
