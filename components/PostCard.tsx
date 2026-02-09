import React, { useState } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';

// Local prayer hand images
const prayingHandFilled = require('../assets/prayingHand.png');
const prayingHandOutline = require('../assets/prayingHandOutline.png');

interface PostCardProps {
  post: any;
  userId: string;
  token: string;
}

const API_URL = 'https://appmychurch.com/api/v1';

const formatTimeDifference = (dateStr: string) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo`;
};

// Strip HTML tags from comment content
const stripHtml = (html: string) => {
  return html.replace(/<[^>]*>/g, '').trim();
};

export const PostCard: React.FC<PostCardProps> = ({ post, userId, token }) => {
  const [liked, setLiked] = useState(post.likes?.some((l: any) => l.church_userId === userId) || false);
  const [hearted, setHearted] = useState(post.post_heart?.some((h: any) => h.church_userId === userId) || false);
  const [prayed, setPrayed] = useState(post.post_praying?.some((p: any) => p.church_userId === userId) || false);
  const [likeCount, setLikeCount] = useState(post.likes?.length || 0);
  const [heartCount, setHeartCount] = useState(post.post_heart?.length || 0);
  const [prayCount, setPrayCount] = useState(post.post_praying?.length || 0);
  const [commentCount] = useState(post.comment?.length || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const handleLike = async () => {
    const was = liked;
    setLiked(!was);
    setLikeCount((c: number) => was ? c - 1 : c + 1);
    try {
      if (was) await axios.delete(`${API_URL}/posts/${post.id}/like`, { headers });
      else await axios.post(`${API_URL}/posts/${post.id}/like`, {}, { headers });
    } catch { setLiked(was); setLikeCount((c: number) => was ? c + 1 : c - 1); }
  };

  const handleHeart = async () => {
    const was = hearted;
    setHearted(!was);
    setHeartCount((c: number) => was ? c - 1 : c + 1);
    try {
      if (was) await axios.delete(`${API_URL}/posts/${post.id}/heart`, { headers });
      else await axios.post(`${API_URL}/posts/${post.id}/heart`, {}, { headers });
    } catch { setHearted(was); setHeartCount((c: number) => was ? c + 1 : c - 1); }
  };

  const handlePray = async () => {
    const was = prayed;
    setPrayed(!was);
    setPrayCount((c: number) => was ? c - 1 : c + 1);
    try {
      if (was) await axios.delete(`${API_URL}/posts/${post.id}/pray`, { headers });
      else await axios.post(`${API_URL}/posts/${post.id}/pray`, {}, { headers });
    } catch { setPrayed(was); setPrayCount((c: number) => was ? c + 1 : c - 1); }
  };

  const openComments = async () => {
    setShowComments(true);
    setLoadingComments(true);
    try {
      const res = await axios.get(`${API_URL}/posts/${post.id}/comments`, { headers });
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (e) { console.error(e); }
    finally { setLoadingComments(false); }
  };

  const sendComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await axios.post(`${API_URL}/posts/${post.id}/comments`, { content: newComment }, { headers });
      setComments((prev) => [...prev, res.data]);
      setNewComment('');
    } catch (e) { console.error(e); }
  };

  const rawContent = post.content || '';
  const content = stripHtml(rawContent);
  const isLong = content.length > 150;
  const displayContent = expanded || !isLong ? content : content.substring(0, 150) + '...';

  const profilePic = post.church_users?.profile_picture_url;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {profilePic ? (
          <Image source={{ uri: profilePic }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{(post.church_users?.name || '?')[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.userName}>{post.church_users?.name}</Text>
          <Text style={styles.timeAgo}>{formatTimeDifference(post.created_at)}</Text>
        </View>
      </View>

      {content ? (
        <View>
          <Text style={styles.content}>{displayContent}</Text>
          {isLong && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)}>
              <Text style={styles.readMore}>{expanded ? 'Read Less...' : 'Read More...'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {post.post_media && post.post_media.length > 0 && post.post_media[0].media_url && (
        <Image source={{ uri: post.post_media[0].media_url }} style={styles.postImage} resizeMode="cover" />
      )}

      {/* Counts row */}
      <View style={styles.countsRow}>
        <View style={styles.countsLeft}>
          {likeCount > 0 && <Text style={styles.countText}>{likeCount} likes</Text>}
          {heartCount > 0 && <Text style={styles.countText}>{heartCount} hearts</Text>}
          {prayCount > 0 && <Text style={styles.countText}>{prayCount} praying</Text>}
        </View>
        {commentCount > 0 && (
          <TouchableOpacity onPress={openComments}>
            <Text style={styles.countText}>{commentCount} comments</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <MaterialIcons name={liked ? 'thumb-up' : 'thumb-up-off-alt'} size={22} color="#3b82f6" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleHeart}>
          <MaterialIcons name={hearted ? 'favorite' : 'favorite-border'} size={22} color="#ef4444" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handlePray}>
          <Image source={prayed ? prayingHandFilled : prayingHandOutline} style={styles.prayIcon} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { marginLeft: 'auto' }]} onPress={openComments}>
          <MaterialIcons name="chat-bubble-outline" size={22} color="#3b82f6" />
          <Text style={styles.commentLabel}>Comment</Text>
        </TouchableOpacity>
      </View>

      {/* Comment Modal */}
      <Modal visible={showComments} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.commentModal}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <MaterialIcons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const commentText = stripHtml(item.content || '');
                return (
                  <View style={styles.commentItem}>
                    {item.church_user?.profile_picture_url ? (
                      <Image source={{ uri: item.church_user.profile_picture_url }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[styles.commentAvatar, styles.avatarFallback]}>
                        <Text style={styles.avatarTextSmall}>{(item.church_user?.name || '?')[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentNameRow}>
                        <Text style={styles.commentUser}>{item.church_user?.name}</Text>
                        <Text style={styles.commentTime}>{formatTimeDifference(item.createdAt)}</Text>
                      </View>
                      <Text style={styles.commentContent}>{commentText}</Text>
                      {item._count?.replies > 0 && (
                        <Text style={styles.replyCount}>{item._count.replies} {item._count.replies === 1 ? 'reply' : 'replies'}</Text>
                      )}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyComments}>{loadingComments ? 'Loading...' : 'No comments yet. Be the first!'}</Text>
              }
            />
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment..."
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity onPress={sendComment} style={styles.sendBtn}>
                <MaterialIcons name="send" size={24} color="#3b82f6" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  avatarFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  avatarTextSmall: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  headerText: { flex: 1 },
  userName: { fontWeight: '600', fontSize: 15 },
  timeAgo: { color: '#666', fontSize: 12 },
  content: { fontSize: 15, lineHeight: 21, paddingHorizontal: 12, marginBottom: 8 },
  readMore: { color: '#3b82f6', fontSize: 13, paddingHorizontal: 12, marginBottom: 8 },
  postImage: { width: '100%', height: 300, marginBottom: 8 },
  countsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 4 },
  countsLeft: { flexDirection: 'row', gap: 12 },
  countText: { color: '#666', fontSize: 13 },
  actions: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  prayIcon: { width: 24, height: 24 },
  commentLabel: { color: '#3b82f6', marginLeft: 4, fontWeight: '500' },
  commentModal: { flex: 1, backgroundColor: '#fff', paddingTop: 50 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  commentTitle: { fontSize: 18, fontWeight: 'bold' },
  commentItem: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', alignItems: 'flex-start' },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentUser: { fontWeight: '600', fontSize: 14 },
  commentTime: { fontSize: 12, color: '#999' },
  commentContent: { fontSize: 14, lineHeight: 20, marginTop: 4, color: '#333' },
  replyCount: { fontSize: 12, color: '#3b82f6', marginTop: 4 },
  emptyComments: { textAlign: 'center', padding: 40, color: '#999' },
  commentInputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'flex-end' },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { marginLeft: 8, padding: 8 },
});
