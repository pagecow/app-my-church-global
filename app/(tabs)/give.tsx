import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import Navbar from '../../components/Navbar';

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
    <View style={styles.container}>
      <Navbar />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.quoteBox}>
          <Text style={styles.quoteText}>{donationQuote}</Text>
        </View>

        <Text style={styles.startGiving}>Start giving today!</Text>

        {appData?.payment_link ? (
          <>
            <TouchableOpacity style={styles.giveButton} onPress={openPaymentLink}>
              <Text style={styles.giveButtonText}>GIVE</Text>
              <MaterialIcons name="arrow-forward" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.note}>
              (To give, you will be taken outside of this app to our church donation web page.)
            </Text>
          </>
        ) : (
          <Text style={styles.note}>Giving is not yet set up for this church.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, alignItems: 'center' },
  quoteBox: { backgroundColor: '#007AFF', borderRadius: 8, padding: 24, marginTop: 20, marginBottom: 30, width: '100%' },
  quoteText: { color: '#fff', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  startGiving: { fontSize: 18, marginBottom: 20, color: '#333' },
  giveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 2, borderColor: '#007AFF', borderRadius: 30, paddingVertical: 16, paddingHorizontal: 40, width: '100%', gap: 10 },
  giveButtonText: { fontSize: 18, fontWeight: 'bold', color: '#333', textTransform: 'uppercase' },
  note: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 16 },
});
