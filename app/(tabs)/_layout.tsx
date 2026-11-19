import React, { useEffect } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * The filled icon marks the tab you are on; the outline is every other tab.
 * The tab bar hands back the tint set below, which is always a colour string.
 */
const tabIcon =
  (on: IoniconName, off: IoniconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) =>
    <Ionicons name={focused ? on : off} size={25} color={color as string} />;

export default function TabLayout() {
  const router = useRouter();
  const { token, isLoading, isLoggingOut, features, locked } = useAuth();

  // For a session that ended by itself (expired, or no session at launch). A
  // tap on Log out is not handled here: the screen that called `logout()` does
  // that one navigation.
  useEffect(() => {
    const redirectIfSignedOut = async () => {
      if (isLoading || token || isLoggingOut) return;
      const appId = await AsyncStorage.getItem('appId');
      router.replace(appId ? '/login' : '/find-church');
    };

    redirectIfSignedOut();
  }, [isLoading, token, isLoggingOut, router]);

  // Signed in, but the church lets nobody in: show the locked screen instead of
  // the tabs. `/locked` sends people back here once the church is open again,
  // and the two conditions can never both be true, so they cannot loop.
  if (!isLoading && token && locked) {
    return <Redirect href="/locked" />;
  }

  // A section the church does not have loses its tab. `features` values are
  // true unless the server said false, so a missing value keeps the tab.
  const hiddenUnless = (enabled: boolean) => (enabled ? {} : { href: null });

  return (
    <Tabs
      // Back from a screen opened over the tabs (Notifications) returns to the
      // tab the person was on, not always to Home.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.azure,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: styles.scene,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: tabIcon('people', 'people-outline'),
          ...hiddenUnless(features.groups),
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          tabBarIcon: tabIcon('play-circle', 'play-circle-outline'),
          ...hiddenUnless(features.videos),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: tabIcon('calendar', 'calendar-outline'),
          ...hiddenUnless(features.events),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
          tabBarIcon: tabIcon('notifications', 'notifications-outline'),
        }}
      />
      <Tabs.Screen
        name="give"
        options={{
          title: 'Give',
          tabBarIcon: tabIcon('heart', 'heart-outline'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.14)',
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: { fontSize: 10.5, fontWeight: '600' },
  scene: { backgroundColor: colors.page },
});
