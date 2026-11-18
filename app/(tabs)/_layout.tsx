import React, { useEffect } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';

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
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF', headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color }) => <MaterialIcons name="groups" size={28} color={color} />,
          ...hiddenUnless(features.groups),
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          tabBarIcon: ({ color }) => <MaterialIcons name="video-library" size={28} color={color} />,
          ...hiddenUnless(features.videos),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color }) => <MaterialIcons name="event" size={28} color={color} />,
          ...hiddenUnless(features.events),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
          tabBarIcon: ({ color }) => <MaterialIcons name="notifications" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="give"
        options={{
          title: 'Give',
          tabBarIcon: ({ color }) => <MaterialIcons name="volunteer-activism" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
