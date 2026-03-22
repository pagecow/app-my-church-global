import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UGC_TERMS_ACK_KEY = 'ugcTermsAcceptedGlobalApp_v1';

export default function TermsScreen() {
  const router = useRouter();

  const handleAcceptTerms = async () => {
    await AsyncStorage.setItem(UGC_TERMS_ACK_KEY, '1');
    Alert.alert('Thanks', 'You can now publish your post.');
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Terms of Use & Community Guidelines</Text>

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

      <TouchableOpacity style={styles.agreeBtn} onPress={handleAcceptTerms}>
        <Text style={styles.agreeBtnText}>I Agree</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 48 },
  header: { paddingTop: 55, paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { marginLeft: 4, fontSize: 16, color: '#111827' },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    paddingHorizontal: 16,
  },
  agreeBtn: {
    marginTop: 24,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  agreeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
