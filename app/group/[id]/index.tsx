import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../context/AuthContext';
import { PostCard } from '../../../components/PostCard';
import { usePaginatedPosts } from '../../../hooks/usePaginatedPosts';
import { API_URL, Group, groupsApi, groupsErrorMessage } from '../../../lib/groups';

const REFRESH_KEY = 'needsGroupsRefresh';

export default function GroupDetailScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [group, setGroup] = useState<Group | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const isMember = group?.membership_state === 'active';
  const canPost = Boolean(isMember && (group?.my_role === 'owner' || group?.my_role === 'admin' || user?.is_admin));
  const canManage = Boolean(
    group?.my_role === 'owner' || group?.my_role === 'admin' || user?.is_admin
  );

  useEffect(() => {
    AsyncStorage.getItem('appId').then(setAppId);
  }, []);

  const loadGroup = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const data = await groupsApi.getGroup(token, groupId);
      setGroup(data);
      setAccessError(null);
    } catch (e: any) {
      setGroup(null);
      setAccessError(groupsErrorMessage(e, 'Could not load this group.'));
    } finally {
      setGroupLoading(false);
    }
  }, [token, groupId]);

  useFocusEffect(
    useCallback(() => {
      loadGroup();
    }, [loadGroup])
  );

  // Only members may read the feed. A non-member gets no request at all rather
  // than a 403 the UI has to explain.
  const feedEndpoint =
    token && groupId && appId && isMember
      ? `${API_URL}/groups/${groupId}/posts?appId=${encodeURIComponent(appId)}`
      : null;

  const {
    posts,
    isPostsLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    onRefresh,
    onEndReached,
    markScrollable,
    consumeRefreshFlag,
  } = usePaginatedPosts({ endpoint: feedEndpoint, token, refreshKey: REFRESH_KEY });

  useFocusEffect(
    useCallback(() => {
      consumeRefreshFlag();
    }, [consumeRefreshFlag])
  );

  if (groupLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (accessError || !group) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.center}>
          <MaterialIcons name="lock-outline" size={44} color="#ccc" />
          <Text style={styles.empty}>{accessError || 'This group is unavailable.'}</Text>
        </View>
      </View>
    );
  }

  const ListHeader = () => (
    <View>
      <View style={styles.groupHeader}>
        <Text style={styles.groupName}>{group.name}</Text>
        {group.description ? <Text style={styles.groupDescription}>{group.description}</Text> : null}
        <View style={styles.metaRow}>
          <MaterialIcons
            name={group.visibility === 'private' ? 'lock' : 'public'}
            size={14}
            color="#888"
          />
          <Text style={styles.metaText}>
            {group.visibility === 'private' ? 'Private' : 'Public'}
            {typeof group.member_count === 'number'
              ? ` · ${group.member_count} member${group.member_count === 1 ? '' : 's'}`
              : ''}
          </Text>
        </View>
      </View>

      {isMember ? (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/group/${group.id}/members`)}
          >
            <MaterialIcons name="people" size={18} color="#333" />
            <Text style={styles.actionText}>Members</Text>
          </TouchableOpacity>
          {canManage ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/group/${group.id}/requests`)}
            >
              <MaterialIcons name="how-to-reg" size={18} color="#333" />
              <Text style={styles.actionText}>Requests</Text>
            </TouchableOpacity>
          ) : null}
          {canManage ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/group/${group.id}/settings`)}
            >
              <MaterialIcons name="settings" size={18} color="#333" />
              <Text style={styles.actionText}>Settings</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {canPost ? (
        <View style={styles.postBar}>
          <View style={styles.postBarInner}>
            {user?.profile_picture_url ? (
              <Image source={{ uri: user.profile_picture_url }} style={styles.postBarAvatar} />
            ) : (
              <View style={[styles.postBarAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{(user?.name || '?')[0].toUpperCase()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.postBarInputWrapper}
              onPress={() =>
                router.push({ pathname: '/create-post', params: { groupId: group.id } })
              }
            >
              <Text style={styles.postBarPlaceholder}>Post in {group.name}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!isMember ? (
        <View style={styles.joinBanner}>
          <Text style={styles.joinText}>
            {group.membership_state === 'pending' || group.has_pending_request
              ? 'Your request to join is waiting for approval.'
              : group.visibility === 'private'
              ? 'This is a private group. Request to join to see the feed.'
              : 'Join this group to see the feed.'}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (isPostsLoading && !isRefreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {group.name}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <FlatList
        data={posts}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            userId={user?.id || ''}
            token={token || ''}
            isAdmin={Boolean(user?.is_admin)}
          />
        )}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={ListHeader}
        refreshControl={
          isMember ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined
        }
        onEndReached={onEndReached}
        onScrollBeginDrag={markScrollable}
        onMomentumScrollBegin={markScrollable}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.footerText}>Loading more posts...</Text>
            </View>
          ) : !hasMore && posts.length > 0 ? (
            <View style={styles.footerLoader}>
              <Text style={styles.footerText}>No more posts</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isMember ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No posts in this group yet.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center: { padding: 30, alignItems: 'center' },
  empty: { textAlign: 'center', color: '#999', paddingHorizontal: 20, marginTop: 8 },
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
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, marginLeft: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', maxWidth: 200 },
  groupHeader: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  groupName: { fontSize: 22, fontWeight: '700', color: '#111' },
  groupDescription: { fontSize: 14, color: '#555', marginTop: 6, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  metaText: { fontSize: 12, color: '#888' },
  actionBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingHorizontal: 8,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 12 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#333' },
  postBar: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  postBarInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  postBarAvatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  postBarInputWrapper: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  postBarPlaceholder: { color: '#999', fontSize: 15 },
  joinBanner: { backgroundColor: '#eff6ff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#dbeafe' },
  joinText: { fontSize: 13, color: '#1e40af', lineHeight: 19 },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { color: '#999', fontSize: 13, marginTop: 4 },
});
