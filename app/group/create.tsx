import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { GroupVisibility, groupsApi, groupsErrorMessage } from '../../lib/groups';

export default function CreateGroupScreen() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = Boolean(user?.is_admin);
  const canSubmit = isAdmin && name.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      const appId = await AsyncStorage.getItem('appId');
      if (!appId) {
        Alert.alert('Error', 'No church selected. Please reopen the app.');
        return;
      }
      const group = await groupsApi.createGroup(token, {
        appId,
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      });
      await AsyncStorage.setItem('needsGroupsRefresh', '1');
      router.replace(`/group/${group.id}`);
    } catch (e: any) {
      Alert.alert('Could not create group', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Group</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="lock-outline" size={44} color="#ccc" />
          <Text style={styles.helper}>Only church admins can create groups.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Group</Text>
        <TouchableOpacity
          style={[styles.saveBtn, !canSubmit && styles.saveBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Group name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Men's Bible Study"
          value={name}
          onChangeText={setName}
          maxLength={80}
          editable={!submitting}
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="What is this group for?"
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          maxLength={500}
          editable={!submitting}
        />

        <Text style={styles.label}>Who can join</Text>
        <TouchableOpacity
          style={[styles.option, visibility === 'private' && styles.optionSelected]}
          onPress={() => setVisibility('private')}
        >
          <MaterialIcons name="lock" size={20} color={visibility === 'private' ? '#1d4ed8' : '#666'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Private - invite or approval</Text>
            <Text style={styles.optionHint}>
              People must be invited or request to join, and an owner approves them.
            </Text>
          </View>
          <MaterialIcons
            name={visibility === 'private' ? 'radio-button-checked' : 'radio-button-unchecked'}
            size={20}
            color={visibility === 'private' ? '#1d4ed8' : '#ccc'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, visibility === 'public' && styles.optionSelected]}
          onPress={() => setVisibility('public')}
        >
          <MaterialIcons name="public" size={20} color={visibility === 'public' ? '#1d4ed8' : '#666'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Public - anyone in the church</Text>
            <Text style={styles.optionHint}>Anyone can find this group and join it.</Text>
          </View>
          <MaterialIcons
            name={visibility === 'public' ? 'radio-button-checked' : 'radio-button-unchecked'}
            size={20}
            color={visibility === 'public' ? '#1d4ed8' : '#ccc'}
          />
        </TouchableOpacity>

        <Text style={styles.footnote}>
          Group posts are only delivered to members. The group is announced in the church app
          only if you make it public.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  helper: { color: '#999', fontSize: 15, marginTop: 10, textAlign: 'center' },
  header: {
    paddingTop: 55,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 70,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#bfdbfe' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#666', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 96 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  optionSelected: { borderColor: '#93c5fd', backgroundColor: '#f8fbff' },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  optionHint: { fontSize: 12, color: '#777', marginTop: 3, lineHeight: 17 },
  footnote: { fontSize: 12, color: '#999', marginTop: 18, lineHeight: 18 },
});
