import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Button, Chip, EmptyState, Loading, Notice, SectionTitle, Tile } from '../../components/ui';
import { Group, groupsApi, groupsErrorMessage } from '../../lib/groups';
import { colors, GUTTER, shapes, text } from '../../lib/theme';

interface Section {
  title: string;
  data: Group[];
}

const stateLabel = (group: Group) => {
  if (group.membership_state === 'active') {
    return group.my_role === 'owner' ? 'Owner' : group.my_role === 'admin' ? 'Admin' : 'Member';
  }
  if (group.membership_state === 'pending') return 'Request pending';
  if (group.membership_state === 'invited') return 'Invited';
  if (group.has_pending_request) return 'Request pending';
  return group.visibility === 'private' ? 'Request to join' : 'Join';
};

export default function GroupsScreen() {
  const { token, user, appData } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const isAdmin = Boolean(user?.is_admin);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    const appId = await AsyncStorage.getItem('appId');
    if (!appId) {
      setLoading(false);
      return;
    }
    try {
      const rows = await groupsApi.listGroups(token, appId);
      setGroups(rows);
      setError(null);
    } catch (e: any) {
      setError(groupsErrorMessage(e, 'Could not load groups.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading && !refreshing) {
    return <Loading />;
  }

  const mine = groups.filter((g) => g.membership_state === 'active');
  const rest = groups.filter((g) => g.membership_state !== 'active');

  const sections: Section[] = [];
  if (mine.length) sections.push({ title: 'My groups', data: mine });
  if (rest.length) sections.push({ title: 'More groups', data: rest });

  const requestAccess = async (group: Group) => {
    if (!token) return;
    setRequestingId(group.id);
    try {
      await groupsApi.requestToJoin(token, group.id);
      // Reflect it immediately: the row flips to "Requested" without a
      // round trip, and the next refresh confirms it from the server.
      setGroups((prev) =>
        prev.map((g) => (g.id === group.id ? { ...g, has_pending_request: true } : g))
      );
    } catch (e: any) {
      Alert.alert('Could not request access', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setRequestingId(null);
    }
  };

  const renderRow = (group: Group) => {
    const label = stateLabel(group);
    const isMember = group.membership_state === 'active';
    const isPrivate = group.visibility === 'private';
    return (
      <TouchableOpacity
        style={[styles.row, isMember ? styles.rowMember : null]}
        activeOpacity={0.75}
        onPress={() => router.push(`/group/${group.id}`)}
      >
        <Tile uri={group.cover_image_url} name={group.name} tinted={isMember} />
        <View style={styles.rowText}>
          <Text style={text.headline} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={styles.meta}>
            {isPrivate ? <Ionicons name="lock-closed" size={13} color={colors.inkMuted} /> : null}
            <Text style={[text.secondary, styles.metaText]} numberOfLines={1}>
              {typeof group.member_count === 'number'
                ? `${isPrivate ? 'Private · ' : ''}${group.member_count} member${
                    group.member_count === 1 ? '' : 's'
                  }`
                : isPrivate
                ? 'Private group'
                : 'Public group'}
            </Text>
          </View>
        </View>
        {isMember ? (
          <View style={styles.trailing}>
            {/* Everyone under "My groups" is a member; only a role worth knowing gets a label. */}
            {label === 'Member' ? null : <Chip label={label} />}
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </View>
        ) : group.has_pending_request || group.membership_state === 'pending' ? (
          <Chip label="Requested" />
        ) : (
          <Button
            label={isPrivate ? 'Ask to join' : 'Join'}
            kind={isPrivate ? 'tinted' : 'primary'}
            size="small"
            loading={requestingId === group.id}
            onPress={() => requestAccess(group)}
            style={styles.joinButton}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={shapes.page}>
      <Navbar
        title="Groups"
        onAdd={isAdmin ? () => router.push('/group/create') : undefined}
        addLabel="Create group"
      />
      {error ? (
        <Notice message={error} actionLabel="Retry" onAction={load} style={styles.notice} />
      ) : null}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.inkMuted}
          />
        }
      >
        {sections.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title={error ? 'Groups could not be loaded.' : 'No groups yet.'}
            hint={isAdmin && !error ? 'Tap the plus button above to create the first group.' : undefined}
          />
        ) : null}
        {sections.map((section, sectionIndex) => (
          <View key={section.title}>
            <SectionTitle style={sectionIndex === 0 ? styles.firstTitle : styles.nextTitle}>
              {section.title}
            </SectionTitle>
            {/* One white block per section, with a line between its rows. */}
            <View style={shapes.group}>
              {section.data.map((group, index) => (
                <React.Fragment key={String(group.id)}>
                  {index > 0 ? <View style={[shapes.divider, styles.divider]} /> : null}
                  {renderRow(group)}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: 4, marginBottom: 8 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 24 },
  firstTitle: { marginTop: 10 },
  nextTitle: { marginTop: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  rowMember: { paddingRight: 10 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /* Clears the group's picture: 12 (row padding) + 46 (picture) + 12 (gap). */
  divider: { marginLeft: 70 },
  joinButton: { minWidth: 60 },
});
