import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Loading, StackHeader, Tile } from '../components/ui';
import { CARD_GAP, colors, GUTTER, shapes, text } from '../lib/theme';

const API_URL = 'https://appmychurch.com/api/v1';

export default function AboutScreen() {
  const { appData } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    return <Loading />;
  }

  const aboutText = appInfo?.about_church?.replace(/<[^>]*>/g, '') || '';
  const locationParts = [appInfo?.city, appInfo?.state_province, appInfo?.zipcode_postalcode].filter(Boolean);
  const locationStr = locationParts.join(', ');

  return (
    <View style={shapes.page}>
      <StackHeader title="About Our Church" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {appInfo ? (
          <View style={styles.identity}>
            <Tile uri={appInfo.logo_url} name={appInfo.name} size={88} fit="contain" />
            {appInfo.name ? (
              <Text style={[text.title, styles.name]} accessibilityRole="header">
                {appInfo.name}
              </Text>
            ) : null}
            {locationStr ? <Text style={styles.location}>{locationStr}</Text> : null}
          </View>
        ) : null}

        {aboutText ? (
          <View style={[shapes.card, styles.aboutCard]}>
            <Text style={text.body}>{aboutText}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: 12,
  },
  identity: { alignItems: 'center', paddingHorizontal: 8, marginBottom: CARD_GAP + 8 },
  name: { marginTop: 16, textAlign: 'center' },
  location: { ...text.body, color: colors.inkMuted, textAlign: 'center', marginTop: 4 },
  aboutCard: { padding: 20 },
});
