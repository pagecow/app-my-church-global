import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Group, groupsApi, groupsErrorMessage } from '../../lib/groups';

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
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const mine = groups.filter((g) => g.membership_state === 'active');
  const rest = groups.filter((g) => g.membership_state !== 'active');

  const sections: Section[] = [];
  if (mine.length) sections.push({ title: 'My Groups', data: mine });
  if (rest.length) sections.push({ title: 'Discover', data: rest });

  const renderRow = (group: Group) => {
    const label = stateLabel(group);
    const isMember = group.membership_state === 'active';
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push(`/group/${group.id}`)}
      >
        <View style={styles.rowIcon}>
          <MaterialIcons
            name={group.visibility === 'private' ? 'lock' : 'public'}
            size={20}
            color="#3b82f6"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {group.name}
          </Text>
          {group.description ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {group.description}
            </Text>
          ) : null}
          <Text style={styles.rowMeta}>
            {typeof group.member_count === 'number'
              ? `${group.member_count} member${group.member_count === 1 ? '' : 's'}`
              : group.visibility === 'private'
              ? 'Private group'
              : 'Public group'}
          </Text>
        </View>
        <View style={[styles.chip, isMember && styles.chipActive]}>
          <Text style={[styles.chipText, isMember && styles.chipTextActive]}>{label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Navbar />
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => renderRow(item)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <MaterialIcons name="groups" size={44} color="#ccc" />
            <Text style={styles.emptyText}>
              {error ? 'Groups could not be loaded.' : 'No groups yet.'}
            </Text>
            {isAdmin && !error ? (
              <Text style={styles.emptyHint}>Create the first group below.</Text>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingBottom: isAdmin ? 96 : 24 }}
      />
      {isAdmin ? (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/group/create')}>
          <MaterialIcons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>Create group</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyText: { color: '#999', fontSize: 15, marginTop: 10, textAlign: 'center' },
  emptyHint: { color: '#bbb', fontSize: 13, marginTop: 4 },
  sectionHeader: {
    backgroundColor: '#f8f8f8',
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
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  rowSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  chipActive: { backgroundColor: '#dbeafe' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: '#1d4ed8' },
  errorBox: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: { color: '#b91c1c', fontSize: 13, flex: 1 },
  retry: { color: '#b91c1c', fontWeight: '700', marginLeft: 12 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 26,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
