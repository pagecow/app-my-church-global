import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform,
  Image,
  Alert
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
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

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.replace('/find-church')}
      >
        <MaterialIcons name="arrow-back" size={28} color="#333" />
      </TouchableOpacity>

      <View style={styles.innerContainer}>
        <View style={styles.logoContainer}>
          {churchLogo ? (
            <Image 
              source={{ uri: churchLogo }} 
              style={styles.logo} 
              resizeMode="contain"
            />
          ) : (
            <Image 
              source={require('../assets/icon.png')} 
              style={styles.logo} 
              resizeMode="contain"
            />
          )}
          <Text style={styles.title}>{churchName}</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity 
            style={styles.button} 
            onPress={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/signup')} style={styles.switchLink}>
            <Text style={styles.switchText}>Don't have an account? <Text style={styles.switchBold}>Sign up</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    zIndex: 10,
    padding: 10,
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
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
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
    marginTop: 15,
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
    marginTop: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  switchText: {
    color: '#666',
  },
  switchBold: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
