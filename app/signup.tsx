import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, Alert, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = 'https://appmychurch.com/api/v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export default function SignupScreen() {
  const { height } = useWindowDimensions();
  const defaultPickerDate = new Date(2000, 0, 1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [pickerBirthDate, setPickerBirthDate] = useState<Date>(defaultPickerDate);
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [appId, setAppId] = useState('');
  const [churchName, setChurchName] = useState('App My Church');
  const [churchLogo, setChurchLogo] = useState<string | null>(null);
  const { signup } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      const id = await AsyncStorage.getItem('appId');
      const name = await AsyncStorage.getItem('churchName');
      const logo = await AsyncStorage.getItem('churchLogo');
      if (id) setAppId(id);
      if (name) setChurchName(name);
      if (logo) setChurchLogo(logo);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const formatDateForApi = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isAtLeast13 = (date: Date) => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age -= 1;
    }
    return age >= 13;
  };

  const openBirthDatePicker = () => {
    setPickerBirthDate(birthDate || defaultPickerDate);
    setShowBirthDatePicker(true);
  };

  const handleSubmitForm = async () => {
    if (!name || !email || !password) { Alert.alert('Error', 'Please fill all required fields'); return; }
    if (!EMAIL_REGEX.test(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters and include at least 1 letter and 1 number.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Terms Required', 'Please agree to the Terms of Use and Community Guidelines to continue.');
      return;
    }
    if (birthDate && !isAtLeast13(birthDate)) {
      Alert.alert('Age Requirement', 'You must be at least 13 years old to sign up for this app.');
      return;
    }
    setIsLoading(true);
    try {
      const checkRes = await axios.post(`${API_URL}/signup/check-email`, { email, appId });
      if (checkRes.data.exists) { Alert.alert('Error', 'Email already registered'); setIsLoading(false); return; }
      await axios.post(`${API_URL}/signup/send-otp`, { email, appId });
      setStep('otp');
      setResendTimer(60);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.message || 'Something went wrong'); }
    finally { setIsLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) { Alert.alert('Error', 'Enter the 6-digit code'); return; }
    setIsLoading(true);
    try {
      const verifyRes = await axios.post(`${API_URL}/signup/verify-otp`, { email, appId, otp });
      if (!verifyRes.data.verified) { Alert.alert('Error', verifyRes.data.message); setIsLoading(false); return; }
      await signup({
        name,
        gender: gender.trim() || undefined,
        birth_date: birthDate ? formatDateForApi(birthDate) : '',
        email,
        password,
        appId,
      });
      router.replace('/');
    } catch (e: any) { Alert.alert('Error', e.message || 'Signup failed'); }
    finally { setIsLoading(false); }
  };

  const handleResend = async () => {
    try {
      await axios.post(`${API_URL}/signup/send-otp`, { email, appId });
      setResendTimer(60);
    } catch {}
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.back()}
      >
        <MaterialIcons name="arrow-back" size={28} color="#333" />
      </TouchableOpacity>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(24, height * 0.25) }]}
      >
        <View style={styles.logoContainer}>
          {churchLogo ? (
            <Image source={{ uri: churchLogo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Image source={require('../assets/icon.png')} style={styles.logo} resizeMode="contain" />
          )}
          <Text style={styles.title}>{churchName}</Text>
          <Text style={styles.subtitle}>Create Account</Text>
        </View>

        {step === 'form' ? (
          <View style={styles.form}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your full name"
              placeholderTextColor="#b7b7b7"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#b7b7b7"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password *</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor="#b7b7b7"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Gender (optional)</Text>
            <View style={styles.genderRow}>
              {['Male', 'Female'].map((g) => (
                <TouchableOpacity key={g} style={[styles.genderBtn, gender === g && styles.genderActive]} onPress={() => setGender(g)}>
                  <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Birth Date (optional)</Text>
            <TouchableOpacity style={styles.pickerField} onPress={openBirthDatePicker}>
              <Text style={styles.pickerValue}>{birthDate ? birthDate.toLocaleDateString() : 'Select birth date'}</Text>
            </TouchableOpacity>
            {showBirthDatePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={pickerBirthDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date(1900, 0, 1)}
                  maximumDate={new Date()}
                  onChange={(_, selectedDate) => {
                    if (!selectedDate) return;
                    setPickerBirthDate(selectedDate);
                    if (Platform.OS !== 'ios') {
                      setBirthDate(selectedDate);
                      setShowBirthDatePicker(false);
                    }
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => {
                      setBirthDate(pickerBirthDate);
                      setShowBirthDatePicker(false);
                    }}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToTerms((prev) => !prev)}>
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                {agreedToTerms ? <Text style={styles.checkboxCheck}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink} onPress={() => router.push('/terms')}>
                  Terms of Use and Community Guidelines
                </Text>
                .
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.button} onPress={handleSubmitForm} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.switchLink}>
              <Text style={styles.switchText}>Already have an account? <Text style={styles.switchBold}>Login</Text></Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.otpTitle}>Check your email</Text>
            <Text style={styles.otpSubtitle}>Enter the 6-digit code sent to {email}</Text>

            <TextInput style={styles.otpInput} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="000000" textAlign="center" />

            <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Create Account</Text>}
            </TouchableOpacity>

            {resendTimer > 0 ? (
              <Text style={styles.resendText}>Resend code in {resendTimer}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend}><Text style={styles.resendLink}>Resend Code</Text></TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    zIndex: 10,
    padding: 10,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: 90 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logo: { width: 80, height: 80, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 18, color: '#666', marginTop: 5 },
  form: { width: '100%' },
  label: { fontSize: 14, color: '#666', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0,
    color: '#222',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 12 },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  genderActive: { borderColor: '#007AFF', backgroundColor: '#eff6ff' },
  genderText: { fontSize: 15, color: '#666' },
  genderTextActive: { color: '#007AFF', fontWeight: '600' },
  pickerField: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  pickerValue: { fontSize: 16, color: '#222' },
  pickerContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  pickerDoneBtn: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
  },
  pickerDoneText: { color: '#2563eb', fontWeight: '700', fontSize: 15 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#9ca3af',
    marginRight: 10,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  checkboxCheck: { color: '#fff', fontSize: 13, fontWeight: '700' },
  termsText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#4b5563' },
  termsLink: { color: '#007AFF', fontWeight: '600' },
  button: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  switchLink: { alignItems: 'center', marginTop: 20 },
  switchText: { color: '#666' },
  switchBold: { color: '#007AFF', fontWeight: '600' },
  otpTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  otpSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  otpInput: { borderWidth: 2, borderColor: '#007AFF', borderRadius: 12, padding: 16, fontSize: 28, letterSpacing: 8, fontWeight: 'bold' },
  resendText: { textAlign: 'center', marginTop: 20, color: '#999' },
  resendLink: { textAlign: 'center', marginTop: 20, color: '#007AFF', fontWeight: '600' },
});
