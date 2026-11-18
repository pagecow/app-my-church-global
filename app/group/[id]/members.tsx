import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Loading,
  SectionTitle,
  StackHeader,
} from '../../../components/ui';
import {
  Group,
  GroupMember,
  InvitableMember,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';
import { colors, GUTTER, radius, shapes, text } from '../../../lib/theme';

const roleLabel = (role: string) =>
  role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member';

// The invite confirmation names the person the way you'd say it out loud.
const firstNameOf = (name?: string | null) => {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || 'That person';
};

const RowSeparator = () => (
  <View style={styles.separator}>
    <View style={[shapes.divider, styles.rowDivider]} />
  </View>
);

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
    return <Loading />;
  }

  return (
    <View style={shapes.page}>
      <StackHeader title="Members" onBack={() => router.back()} />

      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {canManage ? (
              <View>
                <SectionTitle style={styles.firstTitle}>Invite someone</SectionTitle>
                <Text style={[text.footnote, styles.inviteHint]}>
                  Clicking Invite automatically adds the user to your group, and a notification
                  will be sent to let them know they are part of your group now.
                </Text>
                <View style={[shapes.input, styles.searchField]}>
                  <Ionicons name="search" size={18} color={colors.inkFaint} />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    placeholder="Search by name or email"
                    placeholderTextColor={colors.inkFaint}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onChangeText={(value) => {
                      setSearch(value);
                      // Nothing is listed until something is typed, and then only the
                      // matches the server returns for that query.
                      if (value.trim()) {
                        runSearch(value);
                      } else {
                        latestQuery.current = '';
                        setResults([]);
                      }
                    }}
                  />
                  {searching ? <ActivityIndicator size="small" color={colors.azure} /> : null}
                </View>
                {!search.trim() ? null : results.length === 0 && !searching ? (
                  <Text style={[text.footnote, styles.noMatch]}>Nobody matches that search.</Text>
                ) : results.length > 0 ? (
                  <View style={[shapes.group, styles.results]}>
                    {results.map((person, index) => {
                      const invited = invitedIds.includes(person.id);
                      const busy = invitingId === person.id;
                      return (
                        <React.Fragment key={person.id}>
                          {index > 0 ? <View style={[shapes.divider, styles.rowDivider]} /> : null}
                          <View style={styles.row}>
                            <Avatar uri={person.profile_picture_url} name={person.name} size={40} />
                            <View style={styles.rowText}>
                              <Text style={text.headline} numberOfLines={1}>
                                {person.name}
                              </Text>
                              {person.email ? (
                                <Text style={text.secondary} numberOfLines={1}>
                                  {person.email}
                                </Text>
                              ) : null}
                            </View>
                            {invited ? (
                              <Chip label="Invited" />
                            ) : (
                              <Button
                                label="Invite"
                                size="small"
                                loading={busy}
                                onPress={() => invitePerson(person)}
                                style={styles.inviteButton}
                              />
                            )}
                          </View>
                        </React.Fragment>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
            <SectionTitle style={canManage ? styles.nextTitle : styles.firstTitle}>
              {members.length} member{members.length === 1 ? '' : 's'}
            </SectionTitle>
          </View>
        }
        renderItem={({ item, index }) => {
          const isSelf = item.user_id === user?.id;
          return (
            <TouchableOpacity
              style={[
                styles.row,
                styles.memberRow,
                index === 0 ? styles.rowFirst : null,
                index === members.length - 1 ? styles.rowLast : null,
              ]}
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
              <Avatar uri={item.profile_picture_url} name={item.name} size={40} />
              <View style={styles.rowText}>
                <Text style={text.headline}>
                  {item.name}
                  {isSelf ? ' (you)' : ''}
                </Text>
                <Text style={text.secondary}>{roleLabel(item.role)}</Text>
              </View>
              {item.role === 'owner' ? (
                <Ionicons name="star" size={16} color={colors.inkFaint} />
              ) : canManage ? (
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.inkFaint} />
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No members yet." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 32 },
  listHeader: { paddingHorizontal: GUTTER },
  firstTitle: { marginTop: 8 },
  nextTitle: { marginTop: 24 },
  inviteHint: { marginBottom: 12 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 0 },
  searchInput: { flex: 1, minHeight: 52, paddingVertical: 0, fontSize: 17, color: colors.ink },
  noMatch: { marginTop: 10, marginLeft: GUTTER },
  results: { marginTop: 10 },
  inviteButton: { minWidth: 72 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 14,
  },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  /* Clears the row's picture: 12 (row padding) + 40 (picture) + 12 (gap). */
  rowDivider: { marginLeft: 64 },

  /* The members are one white block: the list draws it row by row, so the first
     and the last row carry the rounded corners. */
  memberRow: { marginHorizontal: GUTTER, backgroundColor: colors.card },
  rowFirst: { borderTopLeftRadius: radius.group, borderTopRightRadius: radius.group },
  rowLast: { borderBottomLeftRadius: radius.group, borderBottomRightRadius: radius.group },
  separator: { marginHorizontal: GUTTER, backgroundColor: colors.card },
});
