import React from 'react';
import { StyleSheet, View, Text, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Button } from '../../components/ui';
import { colors, GUTTER, radius, shapes, text } from '../../lib/theme';

export default function GiveScreen() {
  const { appData } = useAuth();

  const defaultMessage = 'Your generous contributions help us spread faith, hope, and love throughout our community and beyond. Thank you for supporting our mission and making a difference in the lives of others.';
  const donationQuote = appData?.donation_quote && appData.donation_quote !== 'default_donation_quote'
    ? appData.donation_quote.replace(/<[^>]*>/g, '') // strip HTML tags for native
    : defaultMessage;

  const openPaymentLink = () => {
    if (appData?.payment_link) Linking.openURL(appData.payment_link);
  };

  return (
    <View style={shapes.page}>
      <Navbar title="Give" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.heart}>
            <Ionicons name="heart" size={32} color={colors.azure} />
          </View>

          <Text style={styles.message}>{donationQuote}</Text>

          {appData?.payment_link ? (
            <>
              <Button
                label="Give"
                iconRight="open-outline"
                onPress={openPaymentLink}
                accessibilityRole="link"
                style={styles.giveButton}
              />
              <Text style={[styles.note, styles.noteUnderButton]}>
                Opens our church's giving page in your browser.
              </Text>
            </>
          ) : (
            <Text style={styles.note}>Giving is not yet set up for this church.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 24 },
  card: {
    alignItems: 'center',
    gap: 18,
    paddingTop: 36,
    paddingHorizontal: 24,
    paddingBottom: 28,
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
  },
  heart: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.azureTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    ...text.bodyLarge,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  giveButton: { alignSelf: 'stretch' },
  note: { ...text.footnote, textAlign: 'center' },
  /* Pulled up a little so the note reads as part of the button above it. */
  noteUnderButton: { marginTop: -6 },
});
