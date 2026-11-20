import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedHasNothingToLoad } from '../lib/feed-state';

/**
 * The paginated-feed state machine, extracted from app/(tabs)/index.tsx so the
 * group feed and the home feed cannot drift apart.
 *
 * Four behaviours here are load-bearing and easy to get wrong:
 *
 * 1. `canLoadMoreOnEndReachedRef` - FlatList fires onEndReached on mount and on
 *    every content-size change. Only a real user scroll may advance the page,
 *    otherwise the feed prefetches itself to the end on first render.
 * 2. Dedupe by id - a post created between page fetches shifts the offset and
 *    hands us a row we already have. Without dedupe that row renders twice.
 * 3. AppState background refresh - coming back after 5+ minutes refetches page
 *    one, so a stale feed does not greet someone returning to the app.
 * 4. Nothing to load - `isPostsLoading` starts true and only a finished fetch
 *    clears it. A caller that is `enabled` but has no endpoint (a group the
 *    person has not joined) never fetches, so without the "nothing to load"
 *    rule its screen showed a spinner forever.
 */

export const PAGE_SIZE = 10;
export const BACKGROUND_REFRESH_MS = 5 * 60 * 1000;

interface UsePaginatedPostsOptions {
  /** Full URL of the feed, or null while it is not known yet (auth/params pending). */
  endpoint: string | null;
  token: string | null;
  /** AsyncStorage key set to '1' by another screen to force a refresh on focus. */
  refreshKey?: string;
  /** Set false to keep the hook idle (e.g. auth still loading). */
  enabled?: boolean;
  pageSize?: number;
}

export function usePaginatedPosts({
  endpoint,
  token,
  refreshKey,
  enabled = true,
  pageSize = PAGE_SIZE,
}: UsePaginatedPostsOptions) {
  const [posts, setPosts] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState as AppStateStatus);
  const backgroundAtRef = useRef<number | null>(null);
  const canLoadMoreOnEndReachedRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // Kept in a ref so fetchPosts keeps a stable identity while reading the
  // newest endpoint/token (avoids refetch loops when the caller re-renders).
  const endpointRef = useRef(endpoint);
  const tokenRef = useRef(token);
  endpointRef.current = endpoint;
  tokenRef.current = token;

  // The caller is ready but there is no feed to read (see behaviour 4 above).
  const nothingToLoad = feedHasNothingToLoad({ enabled, endpoint, token });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Forget a feed that can no longer be read (the person just left the group), and arm the
  // loading flag for whenever there is a feed again, so that moment starts with a spinner
  // rather than a flash of "no posts". What the caller sees is masked below while idle.
  useEffect(() => {
    if (!nothingToLoad) return;
    setPosts([]);
    setPage(1);
    setHasMore(false);
    setIsPostsLoading(true);
    setIsLoadingMore(false);
    setIsRefreshing(false);
  }, [nothingToLoad]);

  const fetchPosts = useCallback(
    async (pageNum: number, reset: boolean) => {
      const url = endpointRef.current;
      const authToken = tokenRef.current;
      if (!url) {
        // Nothing to read. End a refresh the caller just started, or its spinner never stops.
        if (mountedRef.current) setIsRefreshing(false);
        return;
      }
      if (!reset && loadMoreInFlightRef.current) return;

      try {
        if (reset) {
          setIsPostsLoading(true);
        } else {
          loadMoreInFlightRef.current = true;
          setIsLoadingMore(true);
        }

        const response = await axios.get(`${url}&page=${pageNum}&limit=${pageSize}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!mountedRef.current) return;

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
        setHasMore(data.length === pageSize);
      } catch (error) {
        if (mountedRef.current) console.error('Failed to fetch posts:', error);
      } finally {
        if (mountedRef.current) {
          setIsPostsLoading(false);
          setIsLoadingMore(false);
          setIsRefreshing(false);
        }
        if (!reset) loadMoreInFlightRef.current = false;
      }
    },
    [pageSize]
  );

  // Initial load / endpoint switch.
  useEffect(() => {
    if (!enabled || !endpoint || !token) return;
    fetchPosts(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, endpoint, token]);

  // Refresh after a long spell in the background.
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

        if (wasAwayLongEnough && tokenRef.current && endpointRef.current) {
          setIsRefreshing(true);
          fetchPosts(1, true);
        }

        backgroundAtRef.current = null;
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [fetchPosts]);

  // Explicit refresh requested by another screen (e.g. after creating a post).
  // The caller drives useFocusEffect and passes `refreshKey`; we expose
  // consumeRefreshFlag for that.
  const consumeRefreshFlag = useCallback(async () => {
    if (!refreshKey || !tokenRef.current || !endpointRef.current) return;
    const shouldRefresh = await AsyncStorage.getItem(refreshKey);
    if (shouldRefresh === '1') {
      await AsyncStorage.removeItem(refreshKey);
      setIsRefreshing(true);
      fetchPosts(1, true);
    }
  }, [refreshKey, fetchPosts]);

  const onRefresh = useCallback(() => {
    canLoadMoreOnEndReachedRef.current = false;
    setIsRefreshing(true);
    fetchPosts(1, true);
  }, [fetchPosts]);

  const onEndReached = useCallback(() => {
    if (!canLoadMoreOnEndReachedRef.current) return;
    if (isPostsLoading || isRefreshing || isLoadingMore || !hasMore) return;

    canLoadMoreOnEndReachedRef.current = false;
    fetchPosts(page + 1, false);
  }, [fetchPosts, hasMore, isLoadingMore, isPostsLoading, isRefreshing, page]);

  const markScrollable = useCallback(() => {
    canLoadMoreOnEndReachedRef.current = true;
  }, []);

  const reload = useCallback(() => {
    canLoadMoreOnEndReachedRef.current = false;
    setIsRefreshing(true);
    fetchPosts(1, true);
  }, [fetchPosts]);

  return {
    posts,
    setPosts,
    page,
    hasMore,
    // Never "loading" while there is nothing to load.
    isPostsLoading: isPostsLoading && !nothingToLoad,
    isLoadingMore,
    isRefreshing,
    onRefresh,
    onEndReached,
    markScrollable,
    reload,
    consumeRefreshFlag,
  };
}
