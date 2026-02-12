import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';

const API_URL = 'https://appmychurch.com/api/v1';

export default function NotificationThreadScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string; commentId?: string; openComments?: string }>();
  const postId = typeof params.postId === 'string' ? params.postId : '';
  const targetCommentId = typeof params.commentId === 'string' ? params.commentId : '';
  const openComments = params.openComments === '1';

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token || !postId) return;
    const load = async () => {
      setLoading(true);
      try {
        const postRes = await axios.get(`${API_URL}/posts/${postId}`, { headers });
        setPost(postRes.data || null);
      } catch (e) {
        console.error('Failed to load notification thread:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, postId, headers]);

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
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification</Text>
        <View style={{ width: 48 }} />
      </View>

      {post ? (
        <PostCard
          post={post}
          userId={user?.id || ''}
          token={token || ''}
          isAdmin={Boolean(user?.is_admin)}
          initialOpenComments={openComments || Boolean(targetCommentId)}
          initialFocusCommentId={targetCommentId || null}
        />
      ) : (
        <Text style={styles.empty}>Post not found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, marginLeft: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#999', padding: 30 },
});
