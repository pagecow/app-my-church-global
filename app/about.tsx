import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://appmychurch.com/api/v1';

export default function AboutScreen() {
  const { appData } = useAuth();
  const router = useRouter();
  const [appInfo, setAppInfo] = useState<any>(appData);
  const [loading, setLoading] = useState(!appData);

  useEffect(() => {
    if (!appData) fetchAppInfo();
    else setAppInfo(appData);
  }, [appData]);

  const fetchAppInfo = async () => {
    const appId = await AsyncStorage.getItem('appId');
    if (!appId) { setLoading(false); return; }
    try {
      const res = await axios.get(`${API_URL}/app/${appId}`);
      setAppInfo(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  const aboutText = appInfo?.about_church?.replace(/<[^>]*>/g, '') || '';
  const locationParts = [appInfo?.city, appInfo?.state_province, appInfo?.zipcode_postalcode].filter(Boolean);
  const locationStr = locationParts.join(', ');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      {appInfo?.logo_url && (
        <View style={styles.logoContainer}>
          <Image source={{ uri: appInfo.logo_url }} style={styles.logo} resizeMode="contain" />
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.title}>About Our Church</Text>

      {aboutText ? (
        <Text style={styles.aboutText}>{aboutText}</Text>
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.churchName}>{appInfo?.name || ''}</Text>
          {locationStr ? (
            <Text style={styles.location}>Location:{'\n'}{locationStr}</Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 55, paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, marginLeft: 4 },
  logoContainer: { alignItems: 'center', paddingVertical: 16 },
  logo: { width: 80, height: 80 },
  divider: { width: '33%', height: 2, backgroundColor: '#007AFF', alignSelf: 'center', marginVertical: 12, borderRadius: 1 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  aboutText: { fontSize: 15, lineHeight: 24, paddingHorizontal: 16, paddingBottom: 40 },
  fallback: { paddingHorizontal: 16, paddingBottom: 40 },
  churchName: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  location: { fontSize: 15, color: '#666', lineHeight: 22 },
});
