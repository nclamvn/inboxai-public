import { useState, useEffect, useCallback } from 'react';
import { PushNotificationSchema } from '@capacitor/push-notifications';
import {
  initPushNotifications,
  setupPushListeners,
  removePushListeners,
} from '@/lib/capacitor/push-notifications';
import { isNative } from '@/lib/capacitor';

/**
 * Hook to manage push notifications
 *
 * @example
 * const { token, lastNotification, isInitialized, initialize } = usePushNotifications();
 *
 * // Initialize after user login
 * useEffect(() => {
 *   if (user) {
 *     initialize();
 *   }
 * }, [user]);
 *
 * // Send token to backend
 * useEffect(() => {
 *   if (token) {
 *     savePushToken(token);
 *   }
 * }, [token]);
 */
export const usePushNotifications = () => {
  const [token, setToken] = useState<string | null>(null);
  const [lastNotification, setLastNotification] = useState<PushNotificationSchema | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const initialize = useCallback(async () => {
    if (!isNative() || isInitialized) return;

    const pushToken = await initPushNotifications();
    setToken(pushToken);
    setIsInitialized(true);

    // Setup listeners
    setupPushListeners(
      (notification) => {
        setLastNotification(notification);
      },
      (action) => {
        // Handle notification tap - navigation is handled in the listener
        console.log('[Push] Notification tapped:', action);
      }
    );
  }, [isInitialized]);

  useEffect(() => {
    return () => {
      removePushListeners();
    };
  }, []);

  return {
    token,
    lastNotification,
    isInitialized,
    initialize,
  };
};
