import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="find-church" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="about" />
        <Stack.Screen name="notification-thread" />
        <Stack.Screen name="create-post" />
      </Stack>
    </AuthProvider>
  );
}
