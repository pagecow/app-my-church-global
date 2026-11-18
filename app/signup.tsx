import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image, Alert, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { checkDeclaredAge } from '../lib/ageRange';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, StackHeader, Tile } from '../components/ui';
import { colors, GUTTER, shapes, TAP, text } from '../lib/theme';

const API_URL = 'https://appmychurch.com/api/v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

const LOGO_SIZE = 88;

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
    if (!birthDate) {
      Alert.alert('Birth Date Required', 'Please select your birth date. We use it to confirm you are old enough to use the app.');
      return;
    }
    if (!isAtLeast13(birthDate)) {
      Alert.alert('Age Requirement', 'You must be at least 13 years old to sign up for this app.');
      return;
    }
    // Apple's Declared Age Range check runs first: where the OS can answer, it
    // settles the question without trusting a typed date. Where it cannot, it
    // returns 'unknown' and the birth date above remains the gate.
    const declaredAge = await checkDeclaredAge();
    if (declaredAge === 'under-13') {
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
    if (!birthDate) { setStep('form'); return; }
    setIsLoading(true);
    try {
      const verifyRes = await axios.post(`${API_URL}/signup/verify-otp`, { email, appId, otp });
      if (!verifyRes.data.verified) { Alert.alert('Error', verifyRes.data.message); setIsLoading(false); return; }
      await signup({
        name,
        gender: gender.trim() || undefined,
        birth_date: formatDateForApi(birthDate),
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={shapes.page}>
      <StackHeader onBack={() => router.back()} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(24, height * 0.25) }]}
      >
        <View style={styles.column}>
          <View style={styles.brand}>
            {/* The church's own picture once it is known; the app's icon until then. */}
            {appId ? (
              <Tile uri={churchLogo} name={churchName} size={LOGO_SIZE} fit="contain" />
            ) : (
              <Image source={require('../assets/icon.png')} style={styles.appIcon} />
            )}
            {step === 'form' ? (
              <>
                <Text style={[text.title, styles.title]} accessibilityRole="header">{churchName}</Text>
                <Text style={styles.subtitle}>Create your account.</Text>
              </>
            ) : (
              <>
                <Text style={[text.title, styles.title]} accessibilityRole="header">Check your email</Text>
                <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}</Text>
              </>
            )}
          </View>

          {step === 'form' ? (
            <View>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={shapes.input}
                placeholder="Your full name"
                placeholderTextColor={colors.inkFaint}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={shapes.input}
                placeholder="Email address"
                placeholderTextColor={colors.inkFaint}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.label}>Password *</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[shapes.input, styles.passwordInput]}
                  placeholder="Password"
                  placeholderTextColor={colors.inkFaint}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Gender (optional)</Text>
              <View style={styles.genderRow}>
                {['Male', 'Female'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[shapes.input, styles.genderBtn, gender === g && styles.genderActive]}
                    onPress={() => setGender(g)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: gender === g }}
                  >
                    <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Birth Date *</Text>
              <TouchableOpacity style={[shapes.input, styles.pickerField]} onPress={openBirthDatePicker} accessibilityRole="button">
                <Text style={[styles.pickerValue, !birthDate && styles.pickerPlaceholder]}>
                  {birthDate ? birthDate.toLocaleDateString() : 'Select birth date'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={colors.inkFaint} />
              </TouchableOpacity>
              {showBirthDatePicker && (
                <View style={[shapes.card, styles.pickerContainer]}>
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
                    <>
                      <View style={shapes.divider} />
                      <TouchableOpacity
                        style={styles.pickerDoneBtn}
                        onPress={() => {
                          setBirthDate(pickerBirthDate);
                          setShowBirthDatePicker(false);
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              )}

              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setAgreedToTerms((prev) => !prev)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedToTerms }}
              >
                <Ionicons
                  name={agreedToTerms ? 'checkbox' : 'square-outline'}
                  size={26}
                  color={agreedToTerms ? colors.azure : colors.inkFaint}
                />
                <Text style={styles.termsText}>
                  I agree to the{' '}
                  <Text style={styles.termsLink} onPress={() => router.push('/terms')}>
                    Terms of Use and Community Guidelines
                  </Text>
                  .
                </Text>
              </TouchableOpacity>

              <Button label="Sign Up" onPress={handleSubmitForm} loading={isLoading} style={styles.submit} />

              <TouchableOpacity onPress={() => router.back()} style={styles.link} accessibilityRole="button">
                <Text style={styles.switchText}>Already have an account? <Text style={styles.switchBold}>Login</Text></Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput
                style={[shapes.input, styles.otpInput]}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={colors.inkFaint}
                textAlign="center"
              />

              <Button label="Verify & Create Account" onPress={handleVerifyOtp} loading={isLoading} style={styles.submit} />

              {resendTimer > 0 ? (
                <View style={styles.link}>
                  <Text style={styles.resendText}>Resend code in {resendTimer}s</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={handleResend} style={styles.link} accessibilityRole="button">
                  <Text style={text.link}>Resend Code</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: 12 },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: 12 },
  appIcon: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: Math.round(LOGO_SIZE * 0.28) },
  title: { marginTop: 16, textAlign: 'center' },
  subtitle: { ...text.body, color: colors.inkMuted, textAlign: 'center', marginTop: 4 },
  label: {
    ...text.secondary,
    fontWeight: '500',
    color: colors.inkSoft,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  // Room on the right so typed characters never run under "Show".
  passwordInput: { flex: 1, paddingRight: 76 },
  eyeBtn: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    minWidth: 64,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: { ...text.link, fontSize: 15 },
  genderRow: { flexDirection: 'row', gap: 10 },
  // Both sit on the field shape (`shapes.input`), so they line up with the text fields.
  genderBtn: { flex: 1, paddingVertical: 0, alignItems: 'center', justifyContent: 'center' },
  genderActive: { backgroundColor: colors.azureTint },
  genderText: { fontSize: 17, color: colors.ink },
  genderTextActive: { color: colors.azureTintText, fontWeight: '600' },
  pickerField: {
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerValue: { flex: 1, fontSize: 17, color: colors.ink },
  pickerPlaceholder: { color: colors.inkFaint },
  pickerContainer: { marginTop: 8 },
  pickerDoneBtn: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  pickerDoneText: { ...text.link, fontSize: 17, fontWeight: '600' },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TAP, marginTop: 16 },
  termsText: { ...text.secondary, flex: 1, color: colors.inkSoft },
  termsLink: { color: colors.azureText, fontWeight: '600' },
  submit: { marginTop: 24 },
  link: { minHeight: TAP, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  switchText: { ...text.body, color: colors.inkMuted, textAlign: 'center' },
  switchBold: { color: colors.azureText, fontWeight: '600' },
  otpInput: { minHeight: 64, fontSize: 28, letterSpacing: 8, fontWeight: '700', textAlign: 'center' },
  resendText: { ...text.secondary, textAlign: 'center' },
});
