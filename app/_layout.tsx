import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
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
        <Stack.Screen name="notification-thread" />
        <Stack.Screen name="create-post" />
      </Stack>
    </AuthProvider>
  );
}
