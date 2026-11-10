import React, { useCallback, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../context/AuthContext';
import {
  Group,
  GroupVisibility,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';

export default function GroupSettingsScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [group, setGroup] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isOwner = group?.my_role === 'owner' || Boolean(user?.is_admin);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const data = await groupsApi.getGroup(token, groupId);
      setGroup(data);
      setName(data.name || '');
      setDescription(data.description || '');
      setVisibility(data.visibility || 'private');
    } catch (e: any) {
      Alert.alert('Error', groupsErrorMessage(e, 'Could not load this group.'));
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!token || !groupId || !name.trim()) return;
    setSaving(true);
    try {
      await groupsApi.updateGroup(token, groupId, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
      });
      await AsyncStorage.setItem('needsGroupsRefresh', '1');
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const archive = () => {
    Alert.alert(
      'Archive group',
      'The group stops accepting new posts and members. Existing posts are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await groupsApi.updateGroup(token, groupId, { status: 'archived' });
              await AsyncStorage.setItem('needsGroupsRefresh', '1');
              router.back();
            } catch (e: any) {
              Alert.alert('Could not archive', groupsErrorMessage(e, 'Please try again.'));
            }
          },
        },
      ]
    );
  };

  const remove = () => {
    Alert.alert(
      'Delete group',
      'This permanently removes the group and its membership. Posts are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await groupsApi.deleteGroup(token, groupId);
              await AsyncStorage.setItem('needsGroupsRefresh', '1');
              router.replace('/groups');
            } catch (e: any) {
              Alert.alert('Could not delete', groupsErrorMessage(e, 'Please try again.'));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!group || !isOwner) {
    return (
      <View style={styles.loading}>
        <MaterialIcons name="lock-outline" size={44} color="#ccc" />
        <Text style={styles.helper}>Only the group owner can change these settings.</Text>
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
        <Text style={styles.headerTitle}>Group Settings</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!name.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Group name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          maxLength={500}
        />

        <Text style={styles.label}>Who can join</Text>
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segment, visibility === 'private' && styles.segmentActive]}
            onPress={() => setVisibility('private')}
          >
            <Text
              style={[styles.segmentText, visibility === 'private' && styles.segmentTextActive]}
            >
              Private
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, visibility === 'public' && styles.segmentActive]}
            onPress={() => setVisibility('public')}
          >
            <Text
              style={[styles.segmentText, visibility === 'public' && styles.segmentTextActive]}
            >
              Public
            </Text>
          </TouchableOpacity>
        </View>

        {group.topic_synced_at === null ? (
          <View style={styles.warn}>
            <MaterialIcons name="sync-problem" size={16} color="#92400e" />
            <Text style={styles.warnText}>
              Push notifications for this group have not been set up yet. A background job is
              retrying; members may not receive pushes until it completes.
            </Text>
          </View>
        ) : null}

        <View style={styles.dangerZone}>
          <TouchableOpacity style={styles.dangerRow} onPress={archive}>
            <MaterialIcons name="archive" size={20} color="#b45309" />
            <Text style={[styles.dangerText, { color: '#b45309' }]}>Archive group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerRow} onPress={remove}>
            <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
            <Text style={styles.dangerText}>Delete group</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
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
    minWidth: 64,
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
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#e9eef5',
    borderRadius: 10,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 14, color: '#666', fontWeight: '600' },
  segmentTextActive: { color: '#111' },
  warn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    marginTop: 18,
    alignItems: 'flex-start',
  },
  warnText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  dangerZone: { marginTop: 28, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dangerText: { fontSize: 15, color: '#ef4444', fontWeight: '600' },
});
