import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';

export default function TabLayout() {
  const router = useRouter();
  const { token, isLoading, appData } = useAuth();
  const groupsEnabled = Boolean(appData?.groups_enabled);

  useEffect(() => {
    const redirectIfSignedOut = async () => {
      if (isLoading || token) return;
      const appId = await AsyncStorage.getItem('appId');
      router.replace(appId ? '/login' : '/find-church');
    };

    redirectIfSignedOut();
  }, [isLoading, token, router]);

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF', headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={color} />,
        }}
      />
      {/*
        Groups sits directly right of Home. It stays out of the tab bar entirely
        until the server flips groups_enabled, so shipping this release changes
        nothing for churches that have not been opted in.
      */}
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          href: groupsEnabled ? undefined : null,
          tabBarIcon: ({ color }) => <MaterialIcons name="groups" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          tabBarIcon: ({ color }) => <MaterialIcons name="video-library" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color }) => <MaterialIcons name="event" size={28} color={color} />,
        }}
      />
      {/*
        Notifications moves to the Navbar bell once Groups is live. The route is
        kept (href: null hides it from the bar but /notifications still resolves)
        so the bell and any old deep links keep working.
      */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: groupsEnabled ? null : undefined,
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
