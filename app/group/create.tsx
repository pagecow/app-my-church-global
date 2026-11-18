import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, GroupLabel, IconName, SheetHeader } from '../../components/ui';
import { GroupVisibility, groupsApi, groupsErrorMessage } from '../../lib/groups';
import { colors, GUTTER, shapes, TAP, text } from '../../lib/theme';

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
      <View style={shapes.page}>
        <SheetHeader title="New Group" cancelLabel="Close" onCancel={() => router.back()} />
        <EmptyState icon="lock-closed-outline" title="Only church admins can create groups." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={shapes.page}
    >
      <SheetHeader
        title="New Group"
        onCancel={() => router.back()}
        actionLabel="Create"
        onAction={submit}
        actionLoading={submitting}
        actionDisabled={!canSubmit}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GroupLabel>Group name</GroupLabel>
        <TextInput
          style={shapes.input}
          placeholder="e.g. Men's Bible Study"
          placeholderTextColor={colors.inkFaint}
          value={name}
          onChangeText={setName}
          maxLength={80}
          editable={!submitting}
        />

        <GroupLabel style={styles.labelGap}>Description (optional)</GroupLabel>
        <TextInput
          style={[shapes.input, styles.multiline]}
          placeholder="What is this group for?"
          placeholderTextColor={colors.inkFaint}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          maxLength={500}
          editable={!submitting}
        />

        <GroupLabel style={styles.labelGap}>Who can join</GroupLabel>
        <View style={shapes.group}>
          <VisibilityOption
            icon="lock-closed-outline"
            title="Private - invite or approval"
            hint="People must be invited or request to join, and an owner approves them."
            selected={visibility === 'private'}
            onPress={() => setVisibility('private')}
          />
          <View style={[shapes.divider, styles.optionDivider]} />
          <VisibilityOption
            icon="globe-outline"
            title="Public - anyone in the church"
            hint="Anyone can find this group and join it."
            selected={visibility === 'public'}
            onPress={() => setVisibility('public')}
          />
        </View>

        <Text style={[text.footnote, styles.footnote]}>
          Group posts are only delivered to members. The group is announced in the church app
          only if you make it public.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VisibilityOption({
  icon,
  title,
  hint,
  selected,
  onPress,
}: {
  icon: IconName;
  title: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Ionicons name={icon} size={22} color={colors.inkSoft} />
      <View style={styles.optionText}>
        <Text style={text.headline}>{title}</Text>
        <Text style={text.secondary}>{hint}</Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={selected ? colors.azure : colors.inkFaint}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 32 },
  labelGap: { marginTop: 22 },
  multiline: { minHeight: 110 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: TAP,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  optionText: { flex: 1, gap: 2 },
  /* Clears the row's icon: 16 (row padding) + 22 (icon) + 14 (gap). */
  optionDivider: { marginLeft: 52 },
  footnote: { marginTop: 12, marginHorizontal: GUTTER },
});
