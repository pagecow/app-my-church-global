import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, StackHeader } from '../components/ui';
import { CARD_GAP, colors, GUTTER, shapes, text } from '../lib/theme';

const UGC_TERMS_ACK_KEY = 'ugcTermsAcceptedGlobalApp_v1';

export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleAcceptTerms = async () => {
    await AsyncStorage.setItem(UGC_TERMS_ACK_KEY, '1');
    Alert.alert('Thanks', 'You can now publish your post.');
    router.back();
  };

  return (
    <View style={shapes.page}>
      <StackHeader title="Terms of Use" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={[shapes.card, styles.card]}>
          <Text style={text.section} accessibilityRole="header">Terms of Use & Community Guidelines</Text>

          <Text style={styles.sectionTitle}>No Tolerance Policy</Text>
          <Text style={styles.body}>
            App My Church has zero tolerance for objectionable content and abusive behavior. Users may not
            post hateful, harassing, sexually explicit, violent, or otherwise inappropriate content.
          </Text>

          <Text style={styles.sectionTitle}>Moderation and Enforcement</Text>
          <Text style={styles.body}>
            Users can report posts, comments, and users directly from post menus. Reported content may be
            reviewed and removed, and abusive accounts may be suspended or permanently removed.
          </Text>

          <Text style={styles.sectionTitle}>Your Responsibility</Text>
          <Text style={styles.body}>
            By creating an account and posting content, you agree to follow these guidelines and local laws.
            You are responsible for the content you publish in the app.
          </Text>

          <Text style={styles.sectionTitle}>Support and Contact</Text>
          <Text style={styles.body}>
            If you need help or want to report a serious issue, contact the App My Church team through
            appmychurch.com/contact.
          </Text>
        </View>

        <Button label="I Agree" onPress={handleAcceptTerms} />
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
    gap: CARD_GAP + 8,
  },
  card: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  sectionTitle: { ...text.headline, marginTop: 20, marginBottom: 6 },
  body: { ...text.body, color: colors.inkSoft },
});
