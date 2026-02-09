import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

const { width } = Dimensions.get('window');

export default function ShareScreen() {
  const { appData } = useAuth();
  const router = useRouter();

  const churchName = appData?.name || 'My Church';
  // Use the same logic as the web version for share link
  const shareLink = appData?.id === '70867728-cc37-4880-a87e-996ec010e1d8' // CCC UUID
    ? 'https://appmychurch.com/share-ccchurch'
    : 'https://appmychurch.com/share-amc';

  const shareText = appData?.id === '70867728-cc37-4880-a87e-996ec010e1d8'
    ? `I'm inviting you to join my church app!\nDownload the app here: ${shareLink}`
    : `I'm inviting you to join my church app! Search "${churchName}" on the app to join.\nDownload the app here: ${shareLink}`;

  const handleCopyText = async () => {
    try {
      await Clipboard.setStringAsync(shareText);
      Alert.alert('Message Copied!', 'Paste this message anywhere to share this church app.');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.titleRow}>
          <MaterialIcons name="share" size={20} color="#333" />
          <Text style={styles.title}>Send this text to share your group:</Text>
        </View>

        <View style={styles.shareBox}>
          <Text style={styles.shareBody}>
            I'm inviting you to join my church app!{'\n\n'}
            Go to this link to download the app:{'\n'}
            <Text style={styles.link}>{shareLink}</Text>
            {appData?.id !== '70867728-cc37-4880-a87e-996ec010e1d8' && (
              <Text>{'\n\n'}Search for my church name "{churchName}".</Text>
            )}
          </Text>
        </View>

        <TouchableOpacity style={styles.copyBtn} onPress={handleCopyText}>
          <MaterialIcons name="content-copy" size={20} color="#fff" />
          <Text style={styles.copyBtnText}>Copy text</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.qrLabel}>Or show this QR code to install the app:</Text>
        
        <View style={styles.qrContainer}>
          <QRCode
            value={shareLink}
            size={width * 0.6}
            color="black"
            backgroundColor="white"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { padding: 4 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, width: '100%', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  shareBox: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  shareBody: { fontSize: 16, color: '#444', lineHeight: 24 },
  link: { color: '#007AFF', textDecorationLine: 'underline' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    gap: 10,
    marginBottom: 30,
  },
  copyBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  divider: { width: '100%', height: 1, backgroundColor: '#555', marginBottom: 30 },
  qrLabel: { fontSize: 16, color: '#444', marginBottom: 20, textAlign: 'center' },
  qrContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
});
