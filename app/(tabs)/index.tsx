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
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostCard } from '../../components/PostCard';
import Navbar from '../../components/Navbar';
import { MaterialIcons } from '@expo/vector-icons';
import { API_URL } from '../../lib/groups';
import { usePaginatedPosts } from '../../hooks/usePaginatedPosts';

const REFRESH_KEY = 'needsHomeRefresh';

export default function HomeScreen() {
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

  useEffect(() => {
    if (authLoading || !appIdLoaded || token) return;
    router.replace(appId ? '/login' : '/find-church');
  }, [authLoading, appIdLoaded, token, appId, router]);

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
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!token) return null;

  if (isPostsLoading && !isRefreshing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const profilePic = user?.profile_picture_url;
  const canPost = appData?.canAllUsersPost || user?.is_admin;

  const ListHeader = () => (
    <>
      {canPost && (
        <View style={styles.postBar}>
          <View style={styles.postBarInner}>
            {profilePic ? (
              <Image source={{ uri: profilePic }} style={styles.postBarAvatar} />
            ) : (
              <View style={[styles.postBarAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{(user?.name || '?')[0].toUpperCase()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.postBarInputWrapper}
              onPress={() => router.push('/create-post')}
            >
              <Text style={styles.postBarPlaceholder}>Add a post</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare}>
              <MaterialIcons name="share" size={28} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  const ListFooter = () => (
    <>
      {isLoadingMore && (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#007AFF" />
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
    <View style={styles.container}>
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
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        onEndReached={onEndReached}
        onScrollBeginDrag={markScrollable}
        onMomentumScrollBegin={markScrollable}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No posts yet. Be the first!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  postBar: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  postBarInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  postBarAvatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  postBarInputWrapper: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  postBarPlaceholder: { color: '#999', fontSize: 15 },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 15 },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { color: '#999', fontSize: 13, marginTop: 4 },
});
