import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { notificationTarget } from '../lib/notifications';

/**
 * Opens what a push notification is about when the person taps it.
 *
 * "You were added to Youth Group. Tap to open the group." has to open that
 * group, whether the app was already running or the tap started it. Where a
 * notification leads is decided in lib/notifications.ts, the same rule the
 * Notifications screen uses for its rows.
 *
 * It draws nothing. It sits in the root layout, inside the sign-in provider.
 * Keep this file identical in both phone apps.
 */
export default function PushTapHandler() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const signedIn = !isLoading && Boolean(token);
  /** The last notification opened, so one tap is never acted on twice. */
  const opened = useRef<string | null>(null);

  useEffect(() => {
    // Nothing can be opened before the person is signed in.
    if (!signedIn) return;

    const open = (response: Notifications.NotificationResponse | null | undefined) => {
      if (!response) return;
      // Only a plain tap. A notification that was swiped away is not a request to open it.
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification?.request?.identifier;
      if (id && opened.current === id) return;
      opened.current = id || null;
      const target = notificationTarget(response.notification?.request?.content?.data);
      if (target) router.push(target);
    };

    // The tap that started the app while it was closed...
    try {
      open(Notifications.getLastNotificationResponse());
      // ...forgotten once handled, so it is not opened again on the next launch.
      Notifications.clearLastNotificationResponse();
    } catch {
      // A phone that cannot answer simply opens the app on Home.
    }

    // ...and every tap while the app is running or in the background.
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [signedIn, router]);

  return null;
}
