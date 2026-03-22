import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View, Text, Image, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostCard } from '../../components/PostCard';
import Navbar from '../../components/Navbar';
import { MaterialIcons } from '@expo/vector-icons';

const API_URL = 'https://appmychurch.com/api/v1';
const PAGE_SIZE = 10;
const BACKGROUND_REFRESH_MS = 5 * 60 * 1000;

export default function HomeScreen() {
  const { user, token, appData, isLoading: authLoading } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundAtRef = useRef<number | null>(null);
  const canLoadMoreOnEndReachedRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);

  useEffect(() => {
    if (!authLoading) {
      if (!token) checkInitialState();
      else fetchPosts(1, true);
    }
  }, [authLoading, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundAtRef.current = Date.now();
      }

      const wasBackground =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';

      if (wasBackground && nextState === 'active') {
        const backgroundAt = backgroundAtRef.current;
        const wasAwayLongEnough =
          backgroundAt !== null && Date.now() - backgroundAt >= BACKGROUND_REFRESH_MS;

        if (wasAwayLongEnough && token && !authLoading) {
          setIsRefreshing(true);
          fetchPosts(1, true);
        }

        backgroundAtRef.current = null;
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [token, authLoading]);

  useFocusEffect(
    useCallback(() => {
      const refreshIfNeeded = async () => {
        const shouldRefresh = await AsyncStorage.getItem('needsHomeRefresh');
        if (shouldRefresh === '1' && token) {
          await AsyncStorage.removeItem('needsHomeRefresh');
          setIsRefreshing(true);
          fetchPosts(1, true);
        }
      };

      refreshIfNeeded();
    }, [token])
  );

  const checkInitialState = async () => {
    const appId = await AsyncStorage.getItem('appId');
    router.replace(appId ? '/login' : '/find-church');
  };

  const fetchPosts = async (pageNum: number, reset: boolean) => {
    if (!reset && loadMoreInFlightRef.current) return;
    const appId = await AsyncStorage.getItem('appId');
    if (!appId) { setIsPostsLoading(false); router.replace('/find-church'); return; }
    try {
      if (reset) {
        setIsPostsLoading(true);
      } else {
        loadMoreInFlightRef.current = true;
        setIsLoadingMore(true);
      }
      const response = await axios.get(`${API_URL}/posts?appId=${appId}&page=${pageNum}&limit=${PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = Array.isArray(response.data) ? response.data : [];
      if (reset) {
        setPosts(data);
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p: any) => String(p.id)));
          const nextRows = data.filter((row: any) => !existingIds.has(String(row.id)));
          return [...prev, ...nextRows];
        });
      }
      setPage(pageNum);
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    } finally {
      setIsPostsLoading(false);
      setIsLoadingMore(false);
      setIsRefreshing(false);
      if (!reset) loadMoreInFlightRef.current = false;
    }
  };

  const onRefresh = () => {
    canLoadMoreOnEndReachedRef.current = false;
    setIsRefreshing(true);
    fetchPosts(1, true);
  };

  const onEndReached = () => {
    if (!canLoadMoreOnEndReachedRef.current) return;
    if (isPostsLoading || isRefreshing || isLoadingMore || !hasMore) return;

    canLoadMoreOnEndReachedRef.current = false;
    fetchPosts(page + 1, false);
  };

  const handleShare = () => {
    router.push('/share');
  };

  if (authLoading || (isPostsLoading && !isRefreshing)) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  if (!token) return null;

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
          <PostCard post={item} userId={user?.id || ''} token={token} isAdmin={Boolean(user?.is_admin)} />
        )}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        onEndReached={onEndReached}
        onScrollBeginDrag={() => {
          canLoadMoreOnEndReachedRef.current = true;
        }}
        onMomentumScrollBegin={() => {
          canLoadMoreOnEndReachedRef.current = true;
        }}
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
