import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import PushTapHandler from '../components/PushTapHandler';

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* Dark clock and battery icons on our light pages. expo-router drew this
          itself until SDK 56; without it Android shows them in white. */}
      <StatusBar style="auto" />
      {/* A tapped push notification opens the group or post it is about. */}
      <PushTapHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="find-church" />
        {/* Shown in place of the tabs while the church is locked: nothing to go back to. */}
        <Stack.Screen name="locked" options={{ headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="profile" />
        <Stack.Screen name="about" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="notification-thread" />
        <Stack.Screen name="create-post" />
      </Stack>
    </AuthProvider>
  );
}
