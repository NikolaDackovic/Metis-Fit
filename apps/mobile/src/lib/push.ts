import { PLATFORM_NAME } from '@grit/design-tokens';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Push registration. Works in an EAS build (needs `extra.eas.projectId` in app config); on the
 * web, in simulators and without a project ID it quietly does nothing and members still get
 * every message in the in-app inbox.
 */
const projectId: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
  Constants.easConfig?.projectId;
export const pushSupported = Platform.OS !== 'web' && Device.isDevice && Boolean(projectId);

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let registered: string | null = null;

/** Ask permission (once) and send this device's token to the API. */
export async function registerForPush(): Promise<string | null> {
  if (!pushSupported) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: PLATFORM_NAME,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/me/push-tokens', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    registered = token;
    return token;
  } catch {
    return null;
  }
}

/** On sign-out: this device should stop receiving the previous member's notifications. */
export async function unregisterPush() {
  if (!registered) return;
  const token = registered;
  registered = null;
  await api.post('/me/push-tokens/remove', { token }).catch(() => undefined);
}

/** Opening a push takes the member to the screen it is about (phones only; not available on web). */
function useNativePushNavigation() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const link = (last.notification.request.content.data as { link?: string | null } | undefined)
      ?.link;
    router.push((link && link.startsWith('/') ? link : '/notifications') as never);
  }, [last]);
}

export const usePushNavigation: () => void =
  Platform.OS === 'web' ? () => undefined : useNativePushNavigation;
