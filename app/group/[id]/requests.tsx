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
import { useAuth } from '../../../context/AuthContext';
import {
  GroupJoinRequest,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';

export default function GroupRequestsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const rows = await groupsApi.listJoinRequests(token, groupId);
      setRequests(rows);
    } catch (e: any) {
      Alert.alert('Error', groupsErrorMessage(e, 'Could not load requests.'));
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const decide = async (request: GroupJoinRequest, approve: boolean) => {
    if (!token) return;
    setBusyId(request.id);
    try {
      if (approve) {
        await groupsApi.approveJoinRequest(token, groupId, request.id);
      } else {
        await groupsApi.denyJoinRequest(token, groupId, request.id);
      }
      // A denied user can re-request later (the server flips status back to
      // pending), so removing the row is safe - it is not a permanent ban.
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (e: any) {
      Alert.alert('Could not update request', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
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
        <Text style={styles.headerTitle}>Requests</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          return (
            <View style={styles.row}>
              {item.profile_picture_url ? (
                <Image source={{ uri: item.profile_picture_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.message ? (
                  <Text style={styles.message} numberOfLines={2}>
                    {item.message}
                  </Text>
                ) : (
                  <Text style={styles.message}>wants to join this group</Text>
                )}
              </View>
              <View style={styles.actions}>
                {busy ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => decide(item, true)}
                    >
                      <MaterialIcons name="check" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.denyBtn]}
                      onPress={() => decide(item, false)}
                    >
                      <MaterialIcons name="close" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="how-to-reg" size={44} color="#ccc" />
            <Text style={styles.empty}>No pending requests.</Text>
          </View>
        }
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  message: { fontSize: 12, color: '#777', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: '#3b82f6' },
  denyBtn: { backgroundColor: '#fef2f2' },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  empty: { textAlign: 'center', color: '#999', marginTop: 10 },
});
