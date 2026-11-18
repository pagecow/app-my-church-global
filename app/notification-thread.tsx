import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';
import { EmptyState, Loading, StackHeader } from '../components/ui';
import { shapes } from '../lib/theme';

const API_URL = 'https://appmychurch.com/api/v1';

export default function NotificationThreadScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string; commentId?: string; openComments?: string; groupId?: string }>();
  const postId = typeof params.postId === 'string' ? params.postId : '';
  const targetCommentId = typeof params.commentId === 'string' ? params.commentId : '';
  const openComments = params.openComments === '1';
  const groupId = typeof params.groupId === 'string' ? params.groupId : '';

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token || !postId) return;
    const load = async () => {
      setLoading(true);
      try {
        const postRes = await axios.get(`${API_URL}/posts/${postId}`, { headers });
        setPost(postRes.data || null);
        setAccessError(null);
      } catch (e: any) {
        const status = e?.response?.status;
        // Being removed from a group while a push is still sitting in the
        // notification tray is normal, not an error: say so plainly instead of
        // showing a generic failure or an endless spinner.
        if (status === 403 || status === 404) {
          setAccessError(
            groupId
              ? 'You are no longer a member of this group.'
              : 'This post is no longer available.'
          );
        } else {
          setAccessError('Could not load this post.');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, postId, headers, groupId]);

  return (
    <View style={shapes.page}>
      <StackHeader title="Notification" onBack={() => router.back()} />

      {loading ? (
        <Loading />
      ) : post ? (
        // The card brings its own side margins. It scrolls so a long post can be read to the end.
        <ScrollView contentContainerStyle={styles.content}>
          <PostCard
            post={post}
            userId={user?.id || ''}
            token={token || ''}
            isAdmin={Boolean(user?.is_admin)}
            initialOpenComments={openComments || Boolean(targetCommentId)}
            initialFocusCommentId={targetCommentId || null}
          />
        </ScrollView>
      ) : (
        <EmptyState icon="document-text-outline" title={accessError || 'Post not found.'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 24 },
});
