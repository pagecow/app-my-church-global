import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../context/AuthContext';
import { PostCard } from '../../../components/PostCard';
import {
  Avatar,
  EmptyState,
  IconName,
  Loading,
  Notice,
  StackHeader,
  Tile,
} from '../../../components/ui';
import { usePaginatedPosts } from '../../../hooks/usePaginatedPosts';
import { API_URL, Group, groupsApi, groupsErrorMessage } from '../../../lib/groups';
import { CARD_GAP, colors, GUTTER, radius, shapes, text } from '../../../lib/theme';

const REFRESH_KEY = 'needsGroupsRefresh';

export default function GroupDetailScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; inviteId?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';
  const inviteId = typeof params.inviteId === 'string' ? params.inviteId : '';

  const [group, setGroup] = useState<Group | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const acceptedInviteRef = useRef<string>('');

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

  // Landing here from an invite notification IS the accept. Runs once per invite
  // id so a focus change cannot fire a second accept.
  useEffect(() => {
    if (!inviteId || !token || acceptedInviteRef.current === inviteId) return;
    acceptedInviteRef.current = inviteId;
    setAcceptingInvite(true);
    groupsApi
      .acceptInviteById(token, groupId, inviteId)
      .then(() => loadGroup())
      .catch((e: any) => {
        Alert.alert('Could not join', groupsErrorMessage(e, 'The invite may have expired.'));
        loadGroup();
      })
      .finally(() => setAcceptingInvite(false));
  }, [inviteId, token, groupId, loadGroup]);

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
    return <Loading />;
  }

  if (accessError || !group) {
    return (
      <View style={shapes.page}>
        <StackHeader title="Group" onBack={() => router.back()} />
        <EmptyState icon="lock-closed-outline" title={accessError || 'This group is unavailable.'} />
      </View>
    );
  }

  const ListHeader = () => (
    <View>
      <View style={[shapes.card, styles.about]}>
        <View style={styles.aboutTop}>
          <Tile uri={group.cover_image_url} name={group.name} size={56} tinted={isMember} />
          <View style={styles.aboutText}>
            <Text style={text.title}>{group.name}</Text>
            <View style={styles.metaRow}>
              <Ionicons
                name={group.visibility === 'private' ? 'lock-closed' : 'globe-outline'}
                size={13}
                color={colors.inkMuted}
              />
              <Text style={[text.secondary, styles.metaText]}>
                {group.visibility === 'private' ? 'Private' : 'Public'}
                {typeof group.member_count === 'number'
                  ? ` · ${group.member_count} member${group.member_count === 1 ? '' : 's'}`
                  : ''}
              </Text>
            </View>
          </View>
        </View>
        {group.description ? <Text style={styles.description}>{group.description}</Text> : null}
        {!isMember ? (
          <Notice
            kind="neutral"
            style={styles.joinNotice}
            message={
              group.membership_state === 'pending' || group.has_pending_request
                ? 'Your request to join is waiting for approval.'
                : group.visibility === 'private'
                ? 'This is a private group. Request to join to see the feed.'
                : 'Join this group to see the feed.'
            }
          />
        ) : null}
      </View>

      {isMember ? (
        <View style={[shapes.group, styles.block]}>
          <ActionRow
            icon="people-outline"
            label="Members"
            onPress={() => router.push(`/group/${group.id}/members`)}
          />
          {canManage ? (
            <>
              <View style={[shapes.divider, styles.actionDivider]} />
              <ActionRow
                icon="person-add-outline"
                label="Requests"
                onPress={() => router.push(`/group/${group.id}/requests`)}
              />
            </>
          ) : null}
          {canManage ? (
            <>
              <View style={[shapes.divider, styles.actionDivider]} />
              <ActionRow
                icon="settings-outline"
                label="Settings"
                onPress={() => router.push(`/group/${group.id}/settings`)}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {canPost ? (
        <View style={styles.composer}>
          <Avatar uri={user?.profile_picture_url} name={user?.name} size={36} />
          <TouchableOpacity
            style={styles.composerField}
            onPress={() =>
              router.push({ pathname: '/create-post', params: { groupId: group.id } })
            }
            accessibilityRole="button"
            accessibilityLabel={`Post in ${group.name}`}
          >
            <Text style={styles.composerPlaceholder} numberOfLines={1}>
              Post in {group.name}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  if (isPostsLoading && !isRefreshing) {
    return (
      <View style={shapes.page}>
        <StackHeader title={group.name} onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  return (
    <View style={shapes.page}>
      <StackHeader title={group.name} onBack={() => router.back()} />

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
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={ListHeader}
        refreshControl={
          isMember ? (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.inkMuted} />
          ) : undefined
        }
        onEndReached={onEndReached}
        onScrollBeginDrag={markScrollable}
        onMomentumScrollBegin={markScrollable}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.azure} />
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
            <EmptyState icon="chatbubbles-outline" title="No posts in this group yet." />
          ) : null
        }
      />
    </View>
  );
}

/** One line of the group's own menu: Members, Requests, Settings. */
function ActionRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={colors.inkSoft} />
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 4, paddingBottom: 24 },
  about: { marginHorizontal: GUTTER, marginBottom: CARD_GAP, padding: 16, gap: 12 },
  aboutTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  aboutText: { flex: 1, minWidth: 0, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1 },
  description: { ...text.body, color: colors.inkSoft },
  block: { marginHorizontal: GUTTER, marginBottom: CARD_GAP },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 16 },
  actionText: { flex: 1, fontSize: 17, color: colors.ink },
  /* Clears the row's icon: 16 (row padding) + 22 (icon) + 14 (gap). */
  actionDivider: { marginLeft: 52 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    marginBottom: CARD_GAP,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
  },
  composerField: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.page,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  composerPlaceholder: { fontSize: 16, color: colors.inkMuted },
  /* The grey note sits inside the white card, which already has its own padding. */
  joinNotice: { marginHorizontal: 0 },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { ...text.footnote, marginTop: 4 },
});
