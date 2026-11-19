import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostCard } from '../../components/PostCard';
import Navbar from '../../components/Navbar';
import { Avatar, Button, EmptyState, Loading } from '../../components/ui';
import { API_URL } from '../../lib/groups';
import { usePaginatedPosts } from '../../hooks/usePaginatedPosts';
import { useAccent } from '../../lib/churchColor';
import { CARD_GAP, colors, GUTTER, radius, shapes, text } from '../../lib/theme';

const REFRESH_KEY = 'needsHomeRefresh';

export default function HomeScreen() {
  const accent = useAccent();
  const { user, token, appData, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [appId, setAppId] = useState<string | null>(null);
  const [appIdLoaded, setAppIdLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('appId')
      .then((value) => {
        setAppId(value);
      })
      .finally(() => setAppIdLoaded(true));
  }, []);

  // The tab layout above this screen already sends a signed-out person to the
  // login or search screen. This screen used to do the same, which made two
  // navigations for one event.

  // The home feed is church-wide: it never carries a groupId, and the backend
  // filters on posts.group_id IS NULL. Group posts live at /groups/:id/posts.
  const endpoint =
    token && appId ? `${API_URL}/posts?appId=${encodeURIComponent(appId)}` : null;

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
    endpoint,
    token,
    refreshKey: REFRESH_KEY,
    enabled: !authLoading && appIdLoaded,
  });

  useFocusEffect(
    useCallback(() => {
      consumeRefreshFlag();
    }, [consumeRefreshFlag])
  );

  const handleShare = () => {
    router.push('/share');
  };

  if (authLoading || !appIdLoaded) {
    return <Loading />;
  }

  if (!token) return null;

  if (isPostsLoading && !isRefreshing) {
    return <Loading />;
  }

  const canPost = appData?.canAllUsersPost || user?.is_admin;

  const ListHeader = () => (
    <>
      {canPost && (
        <View style={styles.composer}>
          <Avatar uri={user?.profile_picture_url} name={user?.name} size={36} />
          <TouchableOpacity
            style={styles.composerField}
            onPress={() => router.push('/create-post')}
            accessibilityRole="button"
            accessibilityLabel="Write a post"
          >
            <Text style={styles.composerPlaceholder} numberOfLines={1}>
              Write a post
            </Text>
          </TouchableOpacity>
          {/* Words, not an icon: not everyone knows what a share icon means. */}
          <Button label="Share App" kind="tinted" size="small" onPress={handleShare} style={styles.shareButton} />
        </View>
      )}
    </>
  );

  const ListFooter = () => (
    <>
      {isLoadingMore && (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={accent.azure} />
          <Text style={styles.footerText}>Loading more posts...</Text>
        </View>
      )}
      {!hasMore && posts.length > 0 && (
        <View style={styles.footerLoader}>
          <Text style={styles.footerText}>No more posts</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={shapes.page}>
      <Navbar />
      <FlatList
        data={posts}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            userId={user?.id || ''}
            token={token}
            isAdmin={Boolean(user?.is_admin)}
          />
        )}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.inkMuted} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        onEndReached={onEndReached}
        onScrollBeginDrag={markScrollable}
        onMomentumScrollBegin={markScrollable}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <EmptyState icon="chatbubbles-outline" title="No posts yet" hint="Be the first to share something." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 4, paddingBottom: 24 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: GUTTER,
    marginBottom: CARD_GAP,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
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
  shareButton: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14 },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { ...text.footnote, marginTop: 4 },
});
