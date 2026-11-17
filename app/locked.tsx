import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

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
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const message = lockMessage?.trim() || DEFAULT_MESSAGE;
  const busy = isRetrying || isLoggingOut;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {appData?.logo_url ? (
        <Image source={{ uri: appData.logo_url }} style={styles.logo} resizeMode="contain" />
      ) : null}
      {appData?.name ? <Text style={styles.title}>{appData.name}</Text> : null}

      <Text style={styles.message}>{message}</Text>

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={handleTryAgain}
        disabled={busy}
        accessibilityRole="button"
      >
        {isRetrying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Try again</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={busy}
        accessibilityRole="button"
      >
        {isLoggingOut ? (
          <ActivityIndicator color="#ef4444" />
        ) : (
          <Text style={styles.logoutText}>Log out</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
