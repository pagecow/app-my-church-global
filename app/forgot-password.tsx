import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Button, CodeHelp, StackHeader, Tile } from '../components/ui';
import { colors, GUTTER, shapes, TAP, text } from '../lib/theme';

type Step = 'email' | 'otp' | 'password';

const LOGO_SIZE = 88;

export default function ForgotPasswordScreen() {
  const { height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const [step, setStep] = useState<Step>('email');
  const [appId, setAppId] = useState('');
  const [churchName, setChurchName] = useState('App My Church');
  const [churchLogo, setChurchLogo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const storedAppId = await AsyncStorage.getItem('appId');
      const storedName = await AsyncStorage.getItem('churchName');
      const storedLogo = await AsyncStorage.getItem('churchLogo');

      if (storedAppId) setAppId(storedAppId);
      if (storedName) setChurchName(storedName);
      if (storedLogo) setChurchLogo(storedLogo);
      if (typeof params.email === 'string' && params.email.trim().length > 0) {
        setEmail(params.email.trim().toLowerCase());
      }
    };

    loadData();
  }, [params.email]);

  /** Back to the email box, so a misspelled email can be corrected. */
  const fixEmail = () => {
    setOtp('');
    setStep('email');
  };

  const sendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email.');
      return;
    }
    if (!appId) {
      Alert.alert('Error', 'App ID not found. Please select a church first.');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post('https://appmychurch.com/api/v1/login/forgot-password/send-otp', {
        email: email.trim().toLowerCase(),
        appId,
      });
      setStep('otp');
      Alert.alert('Code Sent', 'A verification code was sent to your email.');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Unable to send verification code.';
      Alert.alert('Forgot Password', message);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert('Missing Code', 'Please enter the verification code.');
      return;
    }
    if (!appId) {
      Alert.alert('Error', 'App ID not found. Please select a church first.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.post('https://appmychurch.com/api/v1/login/forgot-password/verify-otp', {
        email: email.trim().toLowerCase(),
        appId,
        otp: otp.trim(),
      });
      if (res.data?.verified) {
        setStep('password');
      } else {
        Alert.alert('Invalid Code', res.data?.message || 'Verification code is invalid.');
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Unable to verify code.';
      Alert.alert('Forgot Password', message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Missing Password', 'Please enter and confirm your new password.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post('https://appmychurch.com/api/v1/login/forgot-password/reset', {
        email: email.trim().toLowerCase(),
        appId,
        otp: otp.trim(),
        password,
      });
      Alert.alert('Success', 'Your password has been reset.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Unable to reset password.';
      Alert.alert('Forgot Password', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={shapes.page}
    >
      <StackHeader onBack={() => router.back()} />

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
              Forgot Password
            </Text>
            {step === 'email' ? (
              <Text style={styles.subtitle}>Enter your email to receive a verification code.</Text>
            ) : step === 'otp' ? (
              <Text style={styles.subtitle}>Enter the code sent to your email.</Text>
            ) : (
              <Text style={styles.subtitle}>Create your new password.</Text>
            )}
          </View>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[shapes.input, step !== 'email' && styles.inputLocked]}
            placeholder="Enter your email"
            placeholderTextColor={colors.inkFaint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={step === 'email'}
          />

          {step !== 'email' && (
            <>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={[shapes.input, step === 'password' && styles.inputLocked]}
                placeholder="Enter verification code"
                placeholderTextColor={colors.inkFaint}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                editable={step !== 'password'}
              />
            </>
          )}

          {step === 'password' && (
            <>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={shapes.input}
                placeholder="Enter new password"
                placeholderTextColor={colors.inkFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={shapes.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.inkFaint}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </>
          )}

          {step === 'email' && (
            <Button label="Send Code" onPress={sendOtp} loading={isLoading} style={styles.submit} />
          )}

          {step === 'otp' && (
            <>
              <Button label="Verify Code" onPress={verifyOtp} loading={isLoading} style={styles.submit} />
              <TouchableOpacity
                onPress={sendOtp}
                style={styles.link}
                disabled={isLoading}
                accessibilityRole="button"
              >
                <Text style={text.link}>Resend Code</Text>
              </TouchableOpacity>
              <CodeHelp email={email} onFixEmail={fixEmail} />
            </>
          )}

          {step === 'password' && (
            <Button label="Reset Password" onPress={resetPassword} loading={isLoading} style={styles.submit} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  // A step that is already done: still shown, no longer editable.
  inputLocked: {
    color: colors.inkMuted,
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
});
