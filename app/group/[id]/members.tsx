import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../../context/AuthContext';
import {
  Group,
  GroupMember,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';

const roleLabel = (role: string) =>
  role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member';

export default function GroupMembersScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const myRole = group?.my_role;
  const canManage = myRole === 'owner' || myRole === 'admin' || Boolean(user?.is_admin);
  const isOwner = myRole === 'owner' || Boolean(user?.is_admin);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const [g, m] = await Promise.all([
        groupsApi.getGroup(token, groupId),
        groupsApi.listMembers(token, groupId),
      ]);
      setGroup(g);
      setMembers(m);
    } catch (e: any) {
      Alert.alert('Error', groupsErrorMessage(e, 'Could not load members.'));
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const createInvite = async () => {
    if (!token) return;
    setCreatingInvite(true);
    try {
      const invite = await groupsApi.createInvite(token, groupId);
      setInviteCode(invite.code);
      Alert.alert('Invite created', 'The invite code is copied to your clipboard.');
      await Clipboard.setStringAsync(invite.code);
    } catch (e: any) {
      Alert.alert('Could not create invite', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setCreatingInvite(false);
    }
  };

  const changeRole = (member: GroupMember) => {
    if (!isOwner || member.role === 'owner' || !token) return;
    const promote = member.role === 'member';
    Alert.alert(
      promote ? 'Make admin' : 'Remove admin',
      promote
        ? `${member.name} can then approve requests and remove members.`
        : `${member.name} will become a regular member.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: promote ? 'Make admin' : 'Remove admin',
          onPress: async () => {
            try {
              await groupsApi.setMemberRole(token, groupId, member.user_id, promote ? 'admin' : 'member');
              await load();
            } catch (e: any) {
              Alert.alert('Could not update role', groupsErrorMessage(e, 'Please try again.'));
            }
          },
        },
      ]
    );
  };

  const removeMember = (member: GroupMember) => {
    if (!canManage || member.role === 'owner' || !token) return;
    Alert.alert(
      'Remove member',
      `${member.name} will stop receiving this group's posts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupsApi.removeMember(token, groupId, member.user_id);
              setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
            } catch (e: any) {
              Alert.alert('Could not remove member', groupsErrorMessage(e, 'Please try again.'));
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Members</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        ListHeaderComponent={
          <View>
            {canManage && group?.visibility === 'private' ? (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteTitle}>Invite someone</Text>
                <Text style={styles.inviteHint}>
                  Share a code. They enter it in Groups to join this group.
                </Text>
                {inviteCode ? (
                  <View style={styles.inviteCodeRow}>
                    <Text style={styles.inviteCode} selectable>
                      {inviteCode}
                    </Text>
                    <TouchableOpacity
                      onPress={async () => {
                        await Clipboard.setStringAsync(inviteCode);
                        Alert.alert('Copied', 'Invite code copied.');
                      }}
                    >
                      <MaterialIcons name="content-copy" size={20} color="#1d4ed8" />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.inviteBtn} onPress={createInvite} disabled={creatingInvite}>
                  {creatingInvite ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.inviteBtnText}>
                      {inviteCode ? 'Create another code' : 'Create invite code'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.sectionHeader}>
              {members.length} member{members.length === 1 ? '' : 's'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelf = item.user_id === user?.id;
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={canManage && item.role !== 'owner' ? 0.7 : 1}
              onPress={() => {
                if (item.role === 'owner') return;
                Alert.alert(item.name, 'What would you like to do?', [
                  { text: 'Cancel', style: 'cancel' },
                  ...(isOwner
                    ? [
                        {
                          text: item.role === 'member' ? 'Make admin' : 'Remove admin',
                          onPress: () => changeRole(item),
                        },
                      ]
                    : []),
                  ...(canManage
                    ? [
                        {
                          text: 'Remove from group',
                          style: 'destructive' as const,
                          onPress: () => removeMember(item),
                        },
                      ]
                    : []),
                ]);
              }}
            >
              {item.profile_picture_url ? (
                <Image source={{ uri: item.profile_picture_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {item.name}
                  {isSelf ? ' (you)' : ''}
                </Text>
                <Text style={styles.role}>{roleLabel(item.role)}</Text>
              </View>
              {item.role === 'owner' ? (
                <MaterialIcons name="star" size={18} color="#f59e0b" />
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  inviteCard: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  inviteTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  inviteHint: { fontSize: 12, color: '#777', marginTop: 4, lineHeight: 17 },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  inviteCode: { fontSize: 16, fontWeight: '700', letterSpacing: 1.5, color: '#1e293b' },
  inviteBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  role: { fontSize: 12, color: '#888', marginTop: 2 },
  empty: { textAlign: 'center', padding: 30, color: '#999' },
});
