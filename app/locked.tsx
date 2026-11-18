import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Button, Loading } from '../components/ui';
import { colors, GUTTER, shapes, text } from '../lib/theme';

const DEFAULT_MESSAGE =
  'This church group has reached its member limit. Go to AppMyChurch.com to learn more.';

/**
 * Shown in place of the tabs while a signed-in person's church is locked.
 *
 * The wording is the server's. This screen adds no link and no sales wording
 * of its own, and that has to stay true for the app stores.
 */
export default function LockedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoading, appData, locked, lockMessage, refreshChurch, logout } = useAuth();

  const [isRetrying, setIsRetrying] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Set once this screen has started to leave, so it navigates away only once.
  const leavingRef = useRef(false);

  // This screen is only for "signed in and locked". Anyone else is sent where
  // they belong: the tabs when the church is open again, otherwise the same
  // place the tabs send a signed-out person.
  useEffect(() => {
    if (isLoading || leavingRef.current) return;

    if (!token) {
      leavingRef.current = true;
      AsyncStorage.getItem('appId')
        .catch(() => null)
        .then((appId) => router.replace(appId ? '/login' : '/find-church'));
      return;
    }

    if (!locked) {
      leavingRef.current = true;
      router.replace('/');
    }
  }, [isLoading, token, locked, router]);

  const handleTryAgain = async () => {
    if (isRetrying || isLoggingOut) return;
    setIsRetrying(true);
    try {
      // When the church is open again the effect above leaves for the tabs.
      await refreshChurch();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLogout = async () => {
    if (isRetrying || isLoggingOut) return;
    setIsLoggingOut(true);
    // Same destination as the menu's Logout; the effect above stands aside.
    leavingRef.current = true;
    await logout();
    router.replace('/find-church');
  };

  if (isLoading) {
    return <Loading />;
  }

  const message = lockMessage?.trim() || DEFAULT_MESSAGE;
  const busy = isRetrying || isLoggingOut;

  return (
    <ScrollView
      style={shapes.page}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={[shapes.card, styles.card]}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.inkSoft} />
        </View>

        {appData?.name ? (
          <Text style={[text.title, styles.title]} accessibilityRole="header">
            {appData.name}
          </Text>
        ) : null}

        <Text style={styles.message}>{message}</Text>

        <Button
          label="Try again"
          onPress={handleTryAgain}
          loading={isRetrying}
          disabled={busy}
          style={styles.tryAgain}
        />
        <Button
          label="Log out"
          kind="quiet"
          onPress={handleLogout}
          loading={isLoggingOut}
          disabled={busy}
          style={styles.logout}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: GUTTER,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
  },
  lockIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.fillSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    ...text.body,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  tryAgain: {
    marginTop: 24,
  },
  logout: {
    marginTop: 10,
  },
});
