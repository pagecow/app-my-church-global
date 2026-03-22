import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

type Step = 'email' | 'otp' | 'password';

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
      style={styles.container}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={28} color="#333" />
      </TouchableOpacity>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(24, height * 0.25) }]}
      >
        <View style={styles.innerContainer}>
          <View style={styles.logoContainer}>
            {churchLogo ? (
              <Image source={{ uri: churchLogo }} style={styles.logo} resizeMode="contain" />
            ) : (
              <Image source={require('../assets/icon.png')} style={styles.logo} resizeMode="contain" />
            )}
            <Text style={styles.title}>{churchName}</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.stepTitle}>Forgot Password</Text>
            {step === 'email' ? (
              <Text style={styles.stepDescription}>Enter your email to receive a verification code.</Text>
            ) : step === 'otp' ? (
              <Text style={styles.stepDescription}>Enter the code sent to your email.</Text>
            ) : (
              <Text style={styles.stepDescription}>Create your new password.</Text>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
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
                  style={styles.input}
                  placeholder="Enter verification code"
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
                  style={styles.input}
                  placeholder="Enter new password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </>
            )}

            {step === 'email' && (
              <TouchableOpacity style={styles.button} onPress={sendOtp} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Code</Text>}
              </TouchableOpacity>
            )}

            {step === 'otp' && (
              <>
                <TouchableOpacity style={styles.button} onPress={verifyOtp} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify Code</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={sendOtp} style={styles.secondaryLink} disabled={isLoading}>
                  <Text style={styles.secondaryText}>Resend Code</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'password' && (
              <TouchableOpacity style={styles.button} onPress={resetPassword} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset Password</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 90,
  },
  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    zIndex: 10,
    padding: 10,
  },
  innerContainer: {
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryLink: {
    alignItems: 'center',
    marginTop: 14,
  },
  secondaryText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
