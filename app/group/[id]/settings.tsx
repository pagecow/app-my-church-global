import React, { useCallback, useState } from 'react';
import {
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../context/AuthContext';
import {
  EmptyState,
  GroupLabel,
  HeaderAction,
  Loading,
  Notice,
  SegmentedControl,
  StackHeader,
} from '../../../components/ui';
import {
  Group,
  GroupVisibility,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';
import { colors, GUTTER, shapes } from '../../../lib/theme';

const VISIBILITY_OPTIONS: { value: GroupVisibility; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
];

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
    if (!token || !groupId) {
      // Nothing to ask for: stop the spinner instead of waiting for an answer that never comes.
      setLoading(false);
      return;
    }
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
      'This permanently removes the group, its members and its posts. It cannot be undone.',
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
    return <Loading />;
  }

  if (!group || !isOwner) {
    return (
      <View style={shapes.page}>
        <StackHeader title="Group Settings" onBack={() => router.back()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Only the group owner can change these settings."
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={shapes.page}
    >
      <StackHeader
        title="Group Settings"
        onBack={() => router.back()}
        right={<HeaderAction label="Save" onPress={save} disabled={!name.trim()} loading={saving} />}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GroupLabel>Group name</GroupLabel>
        <TextInput style={shapes.input} value={name} onChangeText={setName} maxLength={80} />

        <GroupLabel style={styles.labelGap}>Description</GroupLabel>
        <TextInput
          style={[shapes.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          maxLength={500}
        />

        <GroupLabel style={styles.labelGap}>Who can join</GroupLabel>
        <SegmentedControl<GroupVisibility>
          options={VISIBILITY_OPTIONS}
          value={visibility}
          onChange={setVisibility}
        />

        {group.topic_synced_at === null ? (
          <Notice
            kind="neutral"
            style={styles.notice}
            message="Push notifications for this group have not been set up yet. A background job is retrying; members may not receive pushes until it completes."
          />
        ) : null}

        <View style={[shapes.group, styles.actions]}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={archive}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Ionicons name="archive-outline" size={22} color={colors.inkSoft} />
            <Text style={styles.actionText}>Archive group</Text>
          </TouchableOpacity>
          <View style={[shapes.divider, styles.actionDivider]} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={remove}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={22} color={colors.red} />
            <Text style={[styles.actionText, styles.actionTextDanger]}>Delete group</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 32 },
  labelGap: { marginTop: 22 },
  multiline: { minHeight: 110 },
  /* A Notice brings side margins for the bare page; here the page already has them. */
  notice: { marginHorizontal: 0, marginTop: 22 },
  actions: { marginTop: 28 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 16 },
  actionText: { flex: 1, fontSize: 17, color: colors.ink },
  actionTextDanger: { color: colors.red },
  /* Clears the row's icon: 16 (row padding) + 22 (icon) + 14 (gap). */
  actionDivider: { marginLeft: 52 },
});
