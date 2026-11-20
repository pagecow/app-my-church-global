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
  Button,
  EmptyState,
  IconName,
  Loading,
  Notice,
  StackHeader,
  Tile,
} from '../../../components/ui';
import { usePaginatedPosts } from '../../../hooks/usePaginatedPosts';
import { API_URL, Group, groupsApi, groupsErrorMessage } from '../../../lib/groups';
import { useAccent } from '../../../lib/churchColor';
import { groupFeedEndpoint } from '../../../lib/group-feed';
import {
  canLeaveGroup,
  canPostInGroup,
  groupNotice,
  joinActionFor,
  leaveGroupMessage,
} from '../../../lib/group-permissions';
import { CARD_GAP, colors, GUTTER, radius, shapes, text } from '../../../lib/theme';

const REFRESH_KEY = 'needsGroupsRefresh';

export default function GroupDetailScreen() {
  const accent = useAccent();
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
  const [joining, setJoining] = useState(false);
  const acceptedInviteRef = useRef<string>('');
  // Counts the loads, so an answer that arrives after a newer load began is thrown away.
  const latestLoad = useRef(0);

  const isMember = group?.membership_state === 'active';
  // Every member may post in their groups, even when the church keeps "All app users can
  // post in the app" off: that setting is only for the Home feed.
  const canPost = canPostInGroup(group);
  const joinAction = joinActionFor(group);
  const notice = groupNotice(group);
  const canManage = Boolean(
    group?.my_role === 'owner' || group?.my_role === 'admin' || user?.is_admin
  );

  useEffect(() => {
    AsyncStorage.getItem('appId').then(setAppId);
  }, []);

  const loadGroup = useCallback(async () => {
    if (!token || !groupId) {
      // Nothing to ask for: stop the spinner instead of waiting for an answer that never comes.
      setGroupLoading(false);
      return;
    }
    const thisLoad = ++latestLoad.current;
    try {
      const data = await groupsApi.getGroup(token, groupId);
      if (thisLoad !== latestLoad.current) return;
      setGroup(data);
      setAccessError(null);
    } catch (e: any) {
      if (thisLoad !== latestLoad.current) return;
      setGroup(null);
      setAccessError(groupsErrorMessage(e, 'Could not load this group.'));
    } finally {
      if (thisLoad === latestLoad.current) setGroupLoading(false);
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
  // than a 403 the UI has to explain, and the feed then has nothing to load, so this
  // screen must not wait for it (it used to, and spun forever).
  const feedEndpoint = groupFeedEndpoint({ apiUrl: API_URL, token, groupId, appId, group });

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
  } = usePaginatedPosts({
    endpoint: feedEndpoint,
    token,
    refreshKey: REFRESH_KEY,
    // Ready once the group has been read: until then nobody knows whether there is a feed.
    enabled: !groupLoading,
  });

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

  // Join (public) or ask to join (private). The server says which of the two happened, so the
  // group is read back instead of guessing "waiting for approval".
  const joinGroup = async () => {
    if (!token || joining) return;
    setJoining(true);
    try {
      await groupsApi.requestToJoin(token, group.id);
      await loadGroup();
    } catch (e: any) {
      Alert.alert('Could not join', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setJoining(false);
    }
  };

  const confirmLeave = () => {
    if (!token) return;
    const advice = leaveGroupMessage(group);
    if (advice.blocked) {
      Alert.alert('You are the only member', advice.message);
      return;
    }
    Alert.alert(`Leave ${group.name}?`, advice.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await groupsApi.leaveGroup(token, group.id);
            // The Groups list reads itself again when it comes back into view.
            router.back();
          } catch (e: any) {
            Alert.alert('Could not leave', groupsErrorMessage(e, 'Please try again.'));
          }
        },
      },
    ]);
  };

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
        {notice ? <Notice kind="neutral" style={styles.joinNotice} message={notice} /> : null}
        {joinAction ? (
          <Button label={joinAction.label} kind={joinAction.kind} loading={joining} onPress={joinGroup} />
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
          {canLeaveGroup(group) ? (
            <>
              <View style={[shapes.divider, styles.actionDivider]} />
              <ActionRow icon="exit-outline" label="Leave group" danger onPress={confirmLeave} />
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

  // Only a member has a feed to wait for.
  if (isMember && isPostsLoading && !isRefreshing) {
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
              <ActivityIndicator size="small" color={accent.azure} />
              <Text style={styles.footerText}>Loading more posts...</Text>
            </View>
          ) : !hasMore && posts.length > 0 ? (
            <View style={styles.footerLoader}>
              <Text style={styles.footerText}>No more posts</Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          isMember ? (
            <EmptyState icon="chatbubbles-outline" title="No posts in this group yet." />
          ) : undefined
        }
      />
    </View>
  );
}

/** One line of the group's own menu: Members, Requests, Settings, Leave group. */
function ActionRow({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Red, for leaving. */
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.red : colors.inkSoft} />
      <Text style={[styles.actionText, danger ? { color: colors.red } : null]} numberOfLines={1}>
        {label}
      </Text>
      {danger ? null : <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />}
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
