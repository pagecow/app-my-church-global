import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
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
  InvitableMember,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';

const roleLabel = (role: string) =>
  role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member';

// The invite confirmation names the person the way you'd say it out loud.
const firstNameOf = (name?: string | null) => {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || 'That person';
};

export default function GroupMembersScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<InvitableMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  // The last query typed, so a slow response for an older query can't repopulate the
  // list after the box was cleared or refilled.
  const latestQuery = useRef('');

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

  const runSearch = useCallback(
    async (query: string) => {
      if (!token || !groupId) return;
      latestQuery.current = query;
      setSearching(true);
      try {
        const people = await groupsApi.searchInvitableMembers(token, groupId, query);
        if (latestQuery.current === query) setResults(people);
      } catch (e: any) {
        Alert.alert('Could not search', groupsErrorMessage(e, 'Please try again.'));
      } finally {
        setSearching(false);
      }
    },
    [token, groupId]
  );

  const invitePerson = async (person: InvitableMember) => {
    if (!token || invitingId) return;
    setInvitingId(person.id);
    try {
      await groupsApi.inviteMember(token, groupId, person.id);
      setInvitedIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]));
      Alert.alert(`${firstNameOf(person.name)} was added to your group!`);
    } catch (e: any) {
      Alert.alert('Could not invite', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setInvitingId(null);
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
            {canManage ? (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteTitle}>Invite someone</Text>
                <Text style={styles.inviteHint}>
                  Clicking Invite automatically adds the user to your group, and a notification
                  will be sent to let them know they are part of your group now.
                </Text>
                <View style={styles.searchRow}>
                  <MaterialIcons name="search" size={18} color="#64748b" />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    placeholder="Search by name or email"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    returnKeyType="search"
                    onChangeText={(text) => {
                      setSearch(text);
                      // Nothing is listed until something is typed, and then only the
                      // matches the server returns for that query.
                      if (text.trim()) {
                        runSearch(text);
                      } else {
                        latestQuery.current = '';
                        setResults([]);
                      }
                    }}
                  />
                  {searching ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
                </View>
                {!search.trim() ? null : results.length === 0 && !searching ? (
                  <Text style={styles.inviteHint}>Nobody matches that search.</Text>
                ) : (
                  results.map((person) => {
                    const invited = invitedIds.includes(person.id);
                    const busy = invitingId === person.id;
                    return (
                      <View key={person.id} style={styles.candidateRow}>
                        {person.profile_picture_url ? (
                          <Image source={{ uri: person.profile_picture_url }} style={styles.candidateAvatar} />
                        ) : (
                          <View style={[styles.candidateAvatar, styles.avatarFallback]}>
                            <Text style={styles.avatarText}>
                              {(person.name || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.candidateName} numberOfLines={1}>
                            {person.name}
                          </Text>
                          {person.email ? (
                            <Text style={styles.candidateEmail} numberOfLines={1}>
                              {person.email}
                            </Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={[styles.inviteBtn, styles.inviteBtnSmall, (invited || busy) ? styles.inviteBtnDone : null]}
                          onPress={() => invitePerson(person)}
                          disabled={invited || busy}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.inviteBtnText}>{invited ? 'Invited' : 'Invite'}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
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
  inviteBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 2 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  candidateAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e2e8f0' },
  candidateName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  candidateEmail: { fontSize: 12, color: '#64748b' },
  inviteBtnSmall: { paddingHorizontal: 14, paddingVertical: 7, minWidth: 78 },
  inviteBtnDone: { backgroundColor: '#94a3b8' },
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
