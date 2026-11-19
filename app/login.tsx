import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, StackHeader, Tile } from '../components/ui';
import { themedStyles, useAccent } from '../lib/churchColor';
import { colors, GUTTER, linkText, shapes, TAP, text } from '../lib/theme';

const LOGO_SIZE = 88;

export default function LoginScreen() {
  const accent = useAccent();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [appId, setAppId] = useState('');
  const [churchName, setChurchName] = useState('App My Church');
  const [churchLogo, setChurchLogo] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadAppId();
  }, []);

  const loadAppId = async () => {
    const storedAppId = await AsyncStorage.getItem('appId');
    const storedName = await AsyncStorage.getItem('churchName');
    const storedLogo = await AsyncStorage.getItem('churchLogo');

    if (storedAppId) setAppId(storedAppId);
    if (storedName) setChurchName(storedName);
    if (storedLogo) setChurchLogo(storedLogo);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    if (!appId) {
      Alert.alert('Error', 'App ID not found. Please select a church first.');
      return;
    }

    setIsLoggingIn(true);
    try {
      await login(email, password, appId);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    router.push({
      pathname: '/forgot-password',
      params: email ? { email: email.trim().toLowerCase() } : {},
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={shapes.page}
    >
      {/* Back leads to the church search: this is how someone chooses a different church. */}
      <StackHeader onBack={() => router.replace('/find-church')} />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(24, height * 0.25) }]}
      >
        <View style={styles.column}>
          <View style={styles.brand}>
            {/* The church's own picture once it is known; the app's icon until then. */}
            {appId ? (
              <Tile uri={churchLogo} name={churchName} size={LOGO_SIZE} fit="contain" />
            ) : (
              <Image source={require('../assets/icon.png')} style={styles.appIcon} />
            )}
            <Text style={[text.title, styles.title]} accessibilityRole="header">
              {churchName}
            </Text>
            <Text style={styles.subtitle}>Log in to your account.</Text>
          </View>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={shapes.input}
            placeholder="Enter your email"
            placeholderTextColor={colors.inkFaint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={shapes.input}
            placeholder="Enter your password"
            placeholderTextColor={colors.inkFaint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button label="Login" onPress={handleLogin} loading={isLoggingIn} style={styles.submit} />

          <TouchableOpacity onPress={handleForgotPassword} style={styles.link} accessibilityRole="button">
            <Text style={linkText(accent)}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/signup')} style={styles.link} accessibilityRole="button">
            <Text style={styles.switchText}>Don't have an account? <Text style={styles.switchBold}>Sign up</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = themedStyles((accent) => StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: GUTTER,
    paddingTop: 12,
  },
  column: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 12,
  },
  appIcon: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: Math.round(LOGO_SIZE * 0.28),
  },
  title: {
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    ...text.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  label: {
    ...text.secondary,
    fontWeight: '500',
    color: colors.inkSoft,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  submit: {
    marginTop: 28,
  },
  link: {
    minHeight: TAP,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchText: {
    ...text.body,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  switchBold: {
    color: accent.azureText,
    fontWeight: '600',
  },
}));
