import React from 'react';
import { StyleSheet, View, Text, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Button, StackHeader } from '../components/ui';
import { CARD_GAP, colors, GUTTER, shapes, text } from '../lib/theme';

export default function ShareScreen() {
  const { appData } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

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

  // Big enough to scan from across a table, never wider than a phone needs.
  const qrSize = Math.min(Math.round(width * 0.6), 260);

  return (
    <View style={shapes.page}>
      <StackHeader title="Share App" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        <View style={[shapes.card, styles.qrCard]}>
          {/* A QR code needs plain black on plain white to scan reliably. */}
          <QRCode
            value={shareLink}
            size={qrSize}
            color={colors.black}
            backgroundColor={colors.white}
          />
          <Text style={styles.qrLabel}>Scan this code to install the app.</Text>
        </View>

        <View style={[shapes.card, styles.messageCard]}>
          <Text style={text.headline}>Send this text to share your group:</Text>
          <Text style={styles.shareBody}>
            I'm inviting you to join my church app!{'\n\n'}
            Go to this link to download the app:{'\n'}
            <Text style={styles.link}>{shareLink}</Text>
            {appData?.id !== '70867728-cc37-4880-a87e-996ec010e1d8' && (
              <Text>{'\n\n'}Search for my church name "{churchName}".</Text>
            )}
          </Text>
          <Button label="Copy text" icon="copy-outline" onPress={handleCopyText} style={styles.copyBtn} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: 12,
    gap: CARD_GAP,
  },
  qrCard: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20 },
  qrLabel: { ...text.body, color: colors.inkMuted, textAlign: 'center', marginTop: 16 },
  messageCard: { padding: 20 },
  shareBody: { ...text.body, color: colors.inkSoft, marginTop: 8 },
  link: { color: colors.azureText },
  copyBtn: { marginTop: 20 },
});
