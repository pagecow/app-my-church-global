import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View, Text, Image, TouchableOpacity, Pressable, Modal, FlatList, TextInput, Platform, Keyboard, Dimensions, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { Avatar, Button, CircleButton } from './ui';
import { CARD_GAP, colors, GUTTER, radius, TAP } from '../lib/theme';

// The app's own praying-hands artwork. It is drawn in one colour on a clear
// background, so `tintColor` can recolour it: grey until tapped, gold after.
const prayingHandFilled = require('../assets/prayingHand.png');
const prayingHandOutline = require('../assets/prayingHandOutline.png');

interface PostCardProps {
  post: any;
  userId: string;
  token: string;
  isAdmin?: boolean;
  initialOpenComments?: boolean;
  initialFocusCommentId?: string | null;
}

const API_URL = 'https://appmychurch.com/api/v1';
const SCREEN_WIDTH = Dimensions.get('window').width;
/** A post is a card with side margins, so its photos and videos are narrower than the screen. */
const MEDIA_WIDTH = SCREEN_WIDTH - GUTTER * 2;
/** A very tall or very wide photo would make one post fill the screen, so it is letterboxed instead. */
const clampAspectRatio = (ratio: number) => Math.min(Math.max(ratio, 0.8), 2.2);
const LINK_PREVIEW_API = 'https://api.microlink.io';

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
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
};

const URL_REGEX = /((https?:\/\/|www\.)[^\s]+)/i;

const extractFirstUrl = (text: string) => {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  if (!match?.[0]) return null;
  const rawUrl = match[0].trim();
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
};

interface LinkPreviewData {
  title: string;
  description: string;
  siteName: string;
}

const linkPreviewCache = new Map<string, LinkPreviewData | null>();

const getHostFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const fetchLinkPreviewMetadata = async (url: string): Promise<LinkPreviewData | null> => {
  if (linkPreviewCache.has(url)) return linkPreviewCache.get(url) ?? null;

  try {
    const endpoint = `${LINK_PREVIEW_API}?url=${encodeURIComponent(url)}&meta=true&screenshot=false&audio=false&video=false`;
    const response = await axios.get(endpoint, { timeout: 9000 });
    const payload = response.data?.data;

    const preview: LinkPreviewData | null = payload
      ? {
          title: payload.title || getHostFromUrl(url),
          description: payload.description || '',
          siteName: payload.publisher || getHostFromUrl(url),
        }
      : null;

    linkPreviewCache.set(url, preview);
    return preview;
  } catch {
    linkPreviewCache.set(url, null);
    return null;
  }
};

function InlinePostVideo({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    player.pause();
    return () => player.pause();
  }, [player, uri]);

  return <VideoView player={player} style={style} contentFit="contain" nativeControls />;
}


export const PostCard: React.FC<PostCardProps> = ({
  post,
  userId,
  token,
  isAdmin = false,
  initialOpenComments = false,
  initialFocusCommentId = null,
}) => {
  const initialPostComments = Array.isArray(post.comment) ? post.comment : [];
  const initialReplyCount = initialPostComments.reduce((sum: number, item: any) => {
    if (typeof item?._count?.replies === 'number') return sum + item._count.replies;
    if (Array.isArray(item?.replies)) return sum + item.replies.length;
    return item?.parentId ? sum + 1 : sum;
  }, 0);
  const [liked, setLiked] = useState(post.likes?.some((l: any) => l.church_userId === userId) || false);
  const [hearted, setHearted] = useState(post.post_heart?.some((h: any) => h.church_userId === userId) || false);
  const [prayed, setPrayed] = useState(post.post_praying?.some((p: any) => p.church_userId === userId) || false);
  const [likeCount, setLikeCount] = useState(post.likes?.length || 0);
  const [heartCount, setHeartCount] = useState(post.post_heart?.length || 0);
  const [prayCount, setPrayCount] = useState(post.post_praying?.length || 0);
  const [commentCount, setCommentCount] = useState(post.comment?.length || 0);
  const [replyCount, setReplyCount] = useState(initialReplyCount);
  const [postContent, setPostContent] = useState(stripHtml(post.content || ''));
  const [postDeleted, setPostDeleted] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState(stripHtml(post.content || ''));
  const [showEditCommentModal, setShowEditCommentModal] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const [editCommentLabel, setEditCommentLabel] = useState<'Comment' | 'Reply'>('Comment');
  const [showReplyThread, setShowReplyThread] = useState(false);
  const [activeParentComment, setActiveParentComment] = useState<any>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [postImageAspectRatio, setPostImageAspectRatio] = useState(4 / 3);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const commentsListRef = useRef<FlatList<any>>(null);
  const galleryRef = useRef<FlatList<any>>(null);
  const fullscreenRef = useRef<FlatList<any>>(null);
  const autoOpenedRef = useRef(false);
  const insets = useSafeAreaInsets();

  const headers = { Authorization: `Bearer ${token}` };
  const mediaItems = (post?.post_media || []).filter((m: any) => m?.media_url);
  const imageMedia = mediaItems.filter(
    (m: any) => !m?.media_type || String(m.media_type).startsWith('image/')
  );
  const activeMedia = mediaItems[activeMediaIndex];
  const activeImageUrl =
    activeMedia?.media_url &&
    (!activeMedia?.media_type || String(activeMedia.media_type).startsWith('image/'))
      ? activeMedia.media_url
      : undefined;

  useEffect(() => {
    if (!activeImageUrl) return;

    Image.getSize(
      activeImageUrl,
      (width, height) => {
        if (width > 0 && height > 0) setPostImageAspectRatio(width / height);
      },
      () => setPostImageAspectRatio(4 / 3)
    );
  }, [activeImageUrl]);

  useEffect(() => {
    if (!viewerVisible) return;
    const id = setTimeout(() => {
      fullscreenRef.current?.scrollToIndex({ index: viewerIndex, animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [viewerVisible, viewerIndex]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (event) => {
      const h = event.endCoordinates?.height || 0;
      setKeyboardHeight(h);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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


  const handleCommentLike = async (commentId: string, isReply = false) => {
    try {
      const c = isReply 
        ? activeParentComment.replies.find((r: any) => r.id === commentId)
        : comments.find((c: any) => c.id === commentId);
      if (!c) return;

      const wasLiked = c.comment_likes?.some((l: any) => l.church_userId === userId);
      const endpoint = `${API_URL}/posts/${post.id}/comments/${commentId}/like`;
      
      if (wasLiked) await axios.delete(endpoint, { headers });
      else await axios.post(endpoint, {}, { headers });

      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== commentId) return item;
        const nextLikes = wasLiked 
          ? item.comment_likes.filter((l: any) => l.church_userId !== userId)
          : [...(item.comment_likes || []), { church_userId: userId }];
        return { ...item, comment_likes: nextLikes };
      });

      if (isReply) {
        setActiveParentComment((prev: any) => ({ ...prev, replies: updateList(prev.replies) }));
      } else {
        setComments((prev) => updateList(prev));
      }
    } catch (e) { console.error(e); }
  };

  const handleCommentHeart = async (commentId: string, isReply = false) => {
    try {
      const c = isReply 
        ? activeParentComment.replies.find((r: any) => r.id === commentId)
        : comments.find((c: any) => c.id === commentId);
      if (!c) return;

      const wasHearted = c.comment_hearts?.some((h: any) => h.church_userId === userId);
      const endpoint = `${API_URL}/posts/${post.id}/comments/${commentId}/heart`;
      
      if (wasHearted) await axios.delete(endpoint, { headers });
      else await axios.post(endpoint, {}, { headers });

      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== commentId) return item;
        const nextHearts = wasHearted 
          ? item.comment_hearts.filter((h: any) => h.church_userId !== userId)
          : [...(item.comment_hearts || []), { church_userId: userId }];
        return { ...item, comment_hearts: nextHearts };
      });

      if (isReply) {
        setActiveParentComment((prev: any) => ({ ...prev, replies: updateList(prev.replies) }));
      } else {
        setComments((prev) => updateList(prev));
      }
    } catch (e) { console.error(e); }
  };

  const handleCommentPray = async (commentId: string, isReply = false) => {
    try {
      const c = isReply 
        ? activeParentComment.replies.find((r: any) => r.id === commentId)
        : comments.find((c: any) => c.id === commentId);
      if (!c) return;

      const wasPrayed = c.comment_praying?.some((p: any) => p.church_userId === userId);
      const endpoint = `${API_URL}/posts/${post.id}/comments/${commentId}/pray`;
      
      if (wasPrayed) await axios.delete(endpoint, { headers });
      else await axios.post(endpoint, {}, { headers });

      const updateList = (list: any[]) => list.map(item => {
        if (item.id !== commentId) return item;
        const nextPrays = wasPrayed 
          ? item.comment_praying.filter((p: any) => p.church_userId !== userId)
          : [...(item.comment_praying || []), { church_userId: userId }];
        return { ...item, comment_praying: nextPrays };
      });

      if (isReply) {
        setActiveParentComment((prev: any) => ({ ...prev, replies: updateList(prev.replies) }));
      } else {
        setComments((prev) => updateList(prev));
      }
    } catch (e) { console.error(e); }
  };

  const openReplyThread = (comment: any) => {
    setActiveParentComment(comment);
    setShowReplyThread(true);
  };

  const openComments = async () => {
    setShowReplyThread(false);
    setActiveParentComment(null);
    setReplyText('');
    setShowComments(true);
    setLoadingComments(true);
    try {
      const commentsRes = await axios.get(`${API_URL}/posts/${post.id}/comments`, { headers });
      const rows = Array.isArray(commentsRes.data) ? commentsRes.data : [];
      setComments(rows);
      setCommentCount(rows.length);
      const totalReplies = rows.reduce(
        (sum: number, row: any) => sum + (Array.isArray(row?.replies) ? row.replies.length : 0),
        0
      );
      setReplyCount(totalReplies);
    } catch (e) { console.error(e); }
    finally { setLoadingComments(false); }
  };

  useEffect(() => {
    if (initialOpenComments && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      openComments();
    }
  }, [initialOpenComments]);

  useEffect(() => {
    if (!initialFocusCommentId || comments.length === 0) return;
    const idx = comments.findIndex((c) => c.id === initialFocusCommentId);
    if (idx >= 0) {
      setTimeout(() => {
        commentsListRef.current?.scrollToIndex({ index: idx, animated: true });
      }, 150);
    }
  }, [initialFocusCommentId, comments]);

  const sendComment = async (parentId?: string) => {
    if (isSubmittingComment) return;
    const draft = parentId ? replyText : newComment;
    if (!draft.trim()) return;
    setIsSubmittingComment(true);
    try {
      const res = await axios.post(
        `${API_URL}/posts/${post.id}/comments`,
        { content: draft, parentId: parentId || null },
        { headers }
      );

      if (parentId) {
        setComments((prev) =>
          prev.map((comment) => {
            if (comment.id !== parentId) return comment;
            const nextReplies = [...(comment.replies || []), res.data];
            return {
              ...comment,
              replies: nextReplies,
              _count: { ...(comment._count || {}), replies: nextReplies.length },
            };
          })
        );
        setActiveParentComment((prev: any) => {
          if (!prev || prev.id !== parentId) return prev;
          const nextReplies = [...(prev.replies || []), res.data];
          return {
            ...prev,
            replies: nextReplies,
            _count: { ...(prev._count || {}), replies: nextReplies.length },
          };
        });
        setReplyText('');
        setReplyingToCommentId(null);
        setReplyCount((c) => c + 1);
      } else {
        setComments((prev) => [...prev, { ...res.data, replies: [], _count: { replies: 0 } }]);
        setNewComment('');
        setCommentCount((c) => c + 1);
      }
    } catch (e) { console.error(e); }
    finally { setIsSubmittingComment(false); }
  };

  const handleSendPress = () => {
    const parentCommentId = showReplyThread ? activeParentComment?.id : undefined;
    sendComment(parentCommentId);
  };

  const isLong = postContent.length > 150;
  const displayContent = expanded || !isLong ? postContent : `${postContent.substring(0, 150)}...`;
  const sharedUrl = extractFirstUrl(postContent);
  const sharedHost = sharedUrl ? getHostFromUrl(sharedUrl) : '';

  const profilePic = post.church_users?.profile_picture_url;
  const postOwnerId = post.church_users?.id || post.church_user_id;
  const isOwnPost = postOwnerId === userId;
  const canDeletePost = isAdmin || isOwnPost;

  const submitEditPost = async () => {
    if (!editContent.trim()) return;
    try {
      await axios.patch(
        `${API_URL}/posts/${post.id}`,
        { content: editContent.trim() },
        { headers }
      );
      setPostContent(editContent.trim());
      setShowEditModal(false);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to update post.');
    }
  };

  const deletePost = async () => {
    try {
      await axios.delete(`${API_URL}/posts/${post.id}`, { headers });
      setPostDeleted(true);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to delete post.');
    }
  };

  const reportPost = async () => {
    try {
      await axios.post(`${API_URL}/posts/${post.id}/report`, {}, { headers });
      setPostDeleted(true);
      Alert.alert('Reported', 'Post was reported and hidden pending admin review.');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to report post.');
    }
  };

  const reportUser = async (targetUserId: string) => {
    try {
      await axios.post(`${API_URL}/user/${targetUserId}/report`, {}, { headers });
      Alert.alert('Reported', 'User was reported.');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to report user.');
    }
  };

  const openPostOptions = () => {
    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isOwnPost) {
      options.push({
        text: 'Edit Post',
        onPress: () => {
          setEditContent(postContent);
          setShowEditModal(true);
        },
      });
    }

    if (canDeletePost) {
      options.push({
        text: 'Delete Post',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: deletePost },
          ]);
        },
      });
    }

    if (!isOwnPost && postOwnerId) {
      options.push({ text: 'Report Post', onPress: reportPost });
      options.push({ text: 'Report User', onPress: () => reportUser(postOwnerId) });
    }

    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Post Options', 'Choose an action', options);
  };

  const deleteComment = async (commentId: string) => {
    try {
      await axios.delete(`${API_URL}/posts/${post.id}/comments/${commentId}`, { headers });
      setComments((prev) => {
        let removedTopLevel = false;
        let removedTopLevelReplies = 0;
        let removedReply = false;
        const withoutTopLevel = prev.filter((c) => {
          const keep = c.id !== commentId;
          if (!keep) {
            removedTopLevel = true;
            removedTopLevelReplies = Array.isArray(c.replies) ? c.replies.length : 0;
          }
          return keep;
        });

        if (removedTopLevel) {
          setCommentCount((c) => Math.max(0, c - 1));
          if (removedTopLevelReplies > 0) {
            setReplyCount((c) => Math.max(0, c - removedTopLevelReplies));
          }
          return withoutTopLevel;
        }

        const mapped = withoutTopLevel.map((comment) => {
          const before = (comment.replies || []).length;
          const nextReplies = (comment.replies || []).filter((r: any) => r.id !== commentId);
          if (before === nextReplies.length) return comment;
          removedReply = true;
          return {
            ...comment,
            replies: nextReplies,
            _count: { ...(comment._count || {}), replies: nextReplies.length },
          };
        });

        if (removedReply) {
          setReplyCount((c) => Math.max(0, c - 1));
        }

        return mapped;
      });
      setActiveParentComment((prev: any) => {
        if (!prev) return null;
        const nextReplies = (prev.replies || []).filter((r: any) => r.id !== commentId);
        if ((prev.replies || []).length === nextReplies.length) return prev;
        return {
          ...prev,
          replies: nextReplies,
          _count: { ...(prev._count || {}), replies: nextReplies.length },
        };
      });
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to delete comment.');
    }
  };

  const reportComment = async (commentId: string) => {
    try {
      await axios.post(`${API_URL}/posts/${post.id}/comments/${commentId}/report`, {}, { headers });
      Alert.alert('Reported', 'Comment was reported.');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to report comment.');
    }
  };

  const submitEditComment = async () => {
    if (!editingCommentId || !editCommentContent.trim()) return;
    try {
      const res = await axios.patch(
        `${API_URL}/posts/${post.id}/comments/${editingCommentId}`,
        { content: editCommentContent.trim() },
        { headers }
      );
      setComments((prev) =>
        prev.map((c) =>
          c.id === editingCommentId
            ? { ...c, ...res.data, content: editCommentContent.trim() }
            : c
        )
      );
      setActiveParentComment((prev: any) => {
        if (!prev) return null;
        if (prev.id === editingCommentId) {
          return { ...prev, ...res.data, content: editCommentContent.trim() };
        }
        const nextReplies = (prev.replies || []).map((r: any) => 
          r.id === editingCommentId ? { ...r, ...res.data, content: editCommentContent.trim() } : r
        );
        return { ...prev, replies: nextReplies };
      });
      setShowEditCommentModal(false);
      setEditingCommentId(null);
      setEditCommentContent('');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to update comment.');
    }
  };

  const openCommentOptions = (comment: any) => {
    const commentOwnerId = comment.church_user?.id || comment.church_userId;
    const isOwnComment = commentOwnerId === userId;
    const isReply = Boolean(comment.parentId);
    const canDeleteComment = isAdmin || isOwnComment;
    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isOwnComment) {
      options.push({
        text: isReply ? 'Edit Reply' : 'Edit Comment',
        onPress: () => {
          setEditingCommentId(comment.id);
          setEditCommentContent(stripHtml(comment.content || ''));
          setEditCommentLabel(isReply ? 'Reply' : 'Comment');
          setShowEditCommentModal(true);
        },
      });
    }

    if (canDeleteComment) {
      options.push({
        text: isReply ? 'Delete Reply' : 'Delete Comment',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            isReply ? 'Delete Reply' : 'Delete Comment',
            isReply ? 'Are you sure you want to delete this reply?' : 'Are you sure you want to delete this comment?',
            [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteComment(comment.id) },
            ]
          );
        },
      });
    }

    if (!isOwnComment && commentOwnerId) {
      options.push({ text: 'Report Comment', onPress: () => reportComment(comment.id) });
      options.push({ text: 'Report User', onPress: () => reportUser(commentOwnerId) });
    }

    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Comment Options', 'Choose an action', options);
  };

  const findCommentAuthorName = (commentId: string) => {
    const parentComment = comments.find((c) => c.id === commentId);
    return parentComment?.church_user?.name || 'this comment';
  };

  const formatCountLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;
  const totalCommentCount = commentCount + replyCount;

  const openExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Unable to open link', 'This link is not supported on your device.');
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Unable to open link', 'Please try again.');
    }
  };

  useEffect(() => {
    let cancelled = false;

    if (!sharedUrl) {
      setLinkPreview(null);
      setLinkPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLinkPreviewLoading(true);
    fetchLinkPreviewMetadata(sharedUrl)
      .then((data) => {
        if (!cancelled) setLinkPreview(data);
      })
      .finally(() => {
        if (!cancelled) setLinkPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sharedUrl]);

  // Every hook is above this line. Returning earlier than the last hook makes
  // React throw the moment a post is deleted or reported.
  if (postDeleted) return null;

  // Group posts carry the group back-referenced so the same card is never
  // mistaken between Home and a group feed, and can route back to the group.
  const groupName = post.groups?.name || post.group?.name || null;
  const groupId = post.group_id || post.groups?.id || post.group?.id || null;

  const commentLabel =
    totalCommentCount > 0 ? formatCountLabel(totalCommentCount, 'comment', 'comments') : 'Comment';
  const draft = showReplyThread ? replyText : newComment;
  const canSend = !isSubmittingComment && draft.trim().length > 0;

  const closeComments = () => {
    setShowComments(false);
    setShowReplyThread(false);
    setActiveParentComment(null);
    setReplyText('');
  };

  /** Like, love and pray under a comment or a reply. */
  const renderCommentReactions = (item: any, isReply: boolean) => {
    const isLiked = item.comment_likes?.some((l: any) => l.church_userId === userId);
    const isHearted = item.comment_hearts?.some((h: any) => h.church_userId === userId);
    const isPrayed = item.comment_praying?.some((p: any) => p.church_userId === userId);
    const likes = item.comment_likes?.length || 0;
    const hearts = item.comment_hearts?.length || 0;
    const prays = item.comment_praying?.length || 0;

    return (
      <View style={styles.commentReactions}>
        <TouchableOpacity
          style={styles.reactionItem}
          onPress={() => handleCommentLike(item.id, isReply)}
          hitSlop={REACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Like, ${likes}`}
          accessibilityState={{ selected: !!isLiked }}
        >
          <Ionicons
            name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
            size={18}
            color={isLiked ? colors.like : colors.inkMuted}
          />
          {likes > 0 ? <Text style={styles.reactionCount}>{likes}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reactionItem}
          onPress={() => handleCommentHeart(item.id, isReply)}
          hitSlop={REACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Love, ${hearts}`}
          accessibilityState={{ selected: !!isHearted }}
        >
          <Ionicons
            name={isHearted ? 'heart' : 'heart-outline'}
            size={18}
            color={isHearted ? colors.love : colors.inkMuted}
          />
          {hearts > 0 ? <Text style={styles.reactionCount}>{hearts}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reactionItem}
          onPress={() => handleCommentPray(item.id, isReply)}
          hitSlop={REACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Praying, ${prays}`}
          accessibilityState={{ selected: !!isPrayed }}
        >
          <Image
            source={isPrayed ? prayingHandFilled : prayingHandOutline}
            style={[styles.prayIconSmall, { tintColor: isPrayed ? colors.pray : colors.inkMuted }]}
          />
          {prays > 0 ? <Text style={styles.reactionCount}>{prays}</Text> : null}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar uri={profilePic} name={post.church_users?.name} size={40} />
        <View style={styles.headerText}>
          <Text style={styles.userName} numberOfLines={1}>
            {post.church_users?.name}
          </Text>
          <View style={styles.metaLine}>
            <Text style={styles.timeAgo}>{formatTimeDifference(post.created_at)}</Text>
            {groupName ? (
              <>
                <Text style={styles.metaSeparator}>·</Text>
                <TouchableOpacity
                  style={styles.groupBadgeBtn}
                  disabled={!groupId}
                  onPress={() => groupId && router.push(`/group/${groupId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open group ${groupName}`}
                >
                  <Ionicons name="people" size={13} color={colors.azureText} />
                  <Text style={styles.groupBadge} numberOfLines={1}>
                    {groupName}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          style={styles.optionsBtn}
          onPress={openPostOptions}
          accessibilityRole="button"
          accessibilityLabel="Post options"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.inkMuted} />
        </TouchableOpacity>
      </View>

      {postContent ? (
        <View>
          <TextInput
            style={[styles.content, styles.readOnlySelectableText]}
            value={displayContent}
            editable={false}
            multiline
            scrollEnabled={false}
          />
          {isLong && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.readMoreBtn}>
              <Text style={styles.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {sharedUrl ? (
        <TouchableOpacity
          style={styles.linkPreviewCard}
          onPress={() => openExternalLink(sharedUrl)}
          activeOpacity={0.8}
          accessibilityRole="link"
        >
          <View style={styles.linkPreviewTextWrap}>
            <Text style={styles.linkPreviewLabel} numberOfLines={1}>
              {linkPreview?.siteName || sharedHost || 'Shared Link'}
            </Text>
            <Text style={styles.linkPreviewTitle} numberOfLines={2}>
              {linkPreview?.title || sharedUrl}
            </Text>
            {linkPreviewLoading ? (
              <Text style={styles.linkPreviewHint}>Loading preview...</Text>
            ) : linkPreview?.description ? (
              <Text style={styles.linkPreviewDescription} numberOfLines={2}>
                {linkPreview.description}
              </Text>
            ) : null}
          </View>
          <Ionicons name="open-outline" size={18} color={colors.inkMuted} />
        </TouchableOpacity>
      ) : null}

      {mediaItems.length > 0 && (
        <View style={styles.galleryWrap}>
          <FlatList
            ref={galleryRef}
            data={mediaItems}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item.id || item.media_url}-${index}`}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / MEDIA_WIDTH);
              setActiveMediaIndex(index);
            }}
            renderItem={({ item }) =>
              item.media_type?.startsWith('video/') ? (
                <View style={styles.postVideoWrap}>
                  <InlinePostVideo uri={item.media_url} style={styles.postVideo} />
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => {
                    const imageIndex = imageMedia.findIndex((media: any) => media.media_url === item.media_url);
                    if (imageIndex < 0) return;
                    setViewerIndex(imageIndex);
                    setViewerVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: item.media_url }}
                    style={[styles.postImage, { aspectRatio: clampAspectRatio(postImageAspectRatio) }]}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )
            }
          />
          {mediaItems.length > 1 ? (
            <View style={styles.galleryDots} pointerEvents="none">
              {mediaItems.map((_: any, idx: number) => (
                <View key={`dot-${idx}`} style={[styles.dot, idx === activeMediaIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* One row: the three reactions with their counts, then comments. */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleLike}
          accessibilityRole="button"
          accessibilityLabel={`Like, ${likeCount}`}
          accessibilityState={{ selected: liked }}
        >
          <Ionicons
            name={liked ? 'thumbs-up' : 'thumbs-up-outline'}
            size={22}
            color={liked ? colors.like : colors.inkSoft}
          />
          {likeCount > 0 ? <Text style={[styles.actionCount, liked && styles.actionCountOn]}>{likeCount}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleHeart}
          accessibilityRole="button"
          accessibilityLabel={`Love, ${heartCount}`}
          accessibilityState={{ selected: hearted }}
        >
          <Ionicons
            name={hearted ? 'heart' : 'heart-outline'}
            size={23}
            color={hearted ? colors.love : colors.inkSoft}
          />
          {heartCount > 0 ? (
            <Text style={[styles.actionCount, hearted && styles.actionCountOn]}>{heartCount}</Text>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handlePray}
          accessibilityRole="button"
          accessibilityLabel={`Praying, ${prayCount}`}
          accessibilityState={{ selected: prayed }}
        >
          <Image
            source={prayed ? prayingHandFilled : prayingHandOutline}
            style={[styles.prayIcon, { tintColor: prayed ? colors.pray : colors.inkSoft }]}
          />
          {prayCount > 0 ? <Text style={[styles.actionCount, prayed && styles.actionCountOn]}>{prayCount}</Text> : null}
        </TouchableOpacity>
        <View style={styles.actionsSpacer} />
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={openComments}
          accessibilityRole="button"
          accessibilityLabel={totalCommentCount > 0 ? `${commentLabel}, open comments` : 'Write a comment'}
        >
          <Ionicons name="chatbubble-outline" size={21} color={colors.inkSoft} />
          <Text style={styles.actionCount}>{commentLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Comments, and the replies to one comment, share this sheet. */}
      <Modal
        visible={showComments || showReplyThread}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => (showReplyThread ? setShowReplyThread(false) : closeComments())}
      >
        <View style={styles.sheetRoot}>
          <View style={[styles.commentModal, { paddingTop: Platform.OS === 'ios' ? 10 : insets.top + 6 }]}>
            <View style={styles.commentHeader}>
              {showReplyThread ? (
                <>
                  <CircleButton
                    icon="chevron-back"
                    onPress={() => setShowReplyThread(false)}
                    accessibilityLabel="Back to comments"
                  />
                  <Text style={styles.commentTitle}>Replies</Text>
                  <View style={styles.headerSpacer} />
                </>
              ) : (
                <>
                  <View style={styles.headerSpacer} />
                  <Text style={styles.commentTitle}>Comments</Text>
                  <CircleButton icon="close" onPress={closeComments} accessibilityLabel="Close comments" />
                </>
              )}
            </View>

            {showReplyThread && activeParentComment ? (
              <FlatList
                keyboardShouldPersistTaps="always"
                data={activeParentComment.replies || []}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.commentList}
                ListHeaderComponent={() => (
                  <View style={styles.replyParent}>
                    <Avatar
                      uri={activeParentComment.church_user?.profile_picture_url}
                      name={activeParentComment.church_user?.name}
                      size={36}
                    />
                    <View style={styles.commentBody}>
                      <View style={styles.commentNameRow}>
                        <Text style={styles.commentUser} numberOfLines={1}>
                          {activeParentComment.church_user?.name}
                        </Text>
                        <Text style={styles.commentTime}>{formatTimeDifference(activeParentComment.createdAt)}</Text>
                      </View>
                      <TextInput
                        style={[styles.commentContent, styles.readOnlySelectableText]}
                        value={stripHtml(activeParentComment.content || '')}
                        editable={false}
                        multiline
                        scrollEnabled={false}
                      />
                    </View>
                  </View>
                )}
                renderItem={({ item }) => (
                  <View style={styles.replyItem}>
                    <Avatar uri={item.church_user?.profile_picture_url} name={item.church_user?.name} size={30} />
                    <View style={styles.commentBody}>
                      <View style={styles.commentNameRow}>
                        <Text style={styles.commentUser} numberOfLines={1}>
                          {item.church_user?.name}
                        </Text>
                        <Text style={styles.commentTime}>{formatTimeDifference(item.createdAt)}</Text>
                        <TouchableOpacity
                          style={styles.commentOptionsBtn}
                          onPress={() => openCommentOptions(item)}
                          hitSlop={OPTIONS_HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityLabel="Reply options"
                        >
                          <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkMuted} />
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={[styles.commentContent, styles.readOnlySelectableText]}
                        value={stripHtml(item.content || '')}
                        editable={false}
                        multiline
                        scrollEnabled={false}
                      />
                      <View style={styles.commentMetaRow}>{renderCommentReactions(item, true)}</View>
                    </View>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.emptyComments}>No replies yet. Be the first!</Text>}
              />
            ) : (
              <FlatList
                ref={commentsListRef}
                keyboardShouldPersistTaps="always"
                data={comments}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.commentList}
                onScrollToIndexFailed={() => {}}
                renderItem={({ item }) => {
                  const commentText = stripHtml(item.content || '');
                  const highlighted = initialFocusCommentId === item.id;
                  const replies = item._count?.replies || 0;

                  return (
                    <View style={[styles.commentItem, highlighted && styles.commentHighlighted]}>
                      <Avatar uri={item.church_user?.profile_picture_url} name={item.church_user?.name} size={36} />
                      <View style={styles.commentBody}>
                        <View style={styles.commentNameRow}>
                          <Text style={styles.commentUser} numberOfLines={1}>
                            {item.church_user?.name}
                          </Text>
                          <Text style={styles.commentTime}>{formatTimeDifference(item.createdAt)}</Text>
                          <TouchableOpacity
                            style={styles.commentOptionsBtn}
                            onPress={() => openCommentOptions(item)}
                            hitSlop={OPTIONS_HIT_SLOP}
                            accessibilityRole="button"
                            accessibilityLabel="Comment options"
                          >
                            <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkMuted} />
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[styles.commentContent, styles.readOnlySelectableText]}
                          value={commentText}
                          editable={false}
                          multiline
                          scrollEnabled={false}
                        />

                        <View style={styles.commentMetaRow}>
                          {renderCommentReactions(item, false)}
                          <TouchableOpacity
                            style={styles.replyAction}
                            onPress={() => openReplyThread(item)}
                            hitSlop={REACTION_HIT_SLOP}
                            accessibilityRole="button"
                            accessibilityLabel={
                              replies > 0 ? `${formatCountLabel(replies, 'reply', 'replies')}, open replies` : 'Reply'
                            }
                          >
                            <Text style={styles.replyActionText}>
                              {replies > 0 ? formatCountLabel(replies, 'reply', 'replies') : 'Reply'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  loadingComments ? (
                    <ActivityIndicator style={styles.commentsLoading} color={colors.azure} />
                  ) : (
                    <Text style={styles.emptyComments}>No comments yet. Be the first!</Text>
                  )
                }
              />
            )}

            <View style={[styles.commentInputRow, keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 30 } : null]}>
              <TextInput
                style={styles.commentInput}
                placeholder={showReplyThread ? 'Add a reply...' : 'Write a comment...'}
                placeholderTextColor={colors.inkFaint}
                value={draft}
                onChangeText={showReplyThread ? setReplyText : setNewComment}
                multiline
              />
              <Pressable
                onPress={handleSendPress}
                disabled={!canSend}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                style={[styles.sendBtn, canSend || isSubmittingComment ? null : styles.sendBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={showReplyThread ? 'Send reply' : 'Send comment'}
              >
                {isSubmittingComment ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={canSend ? colors.white : colors.inkFaint} />
                )}
              </Pressable>
            </View>

            {showEditCommentModal && (
              <View style={styles.inlineEditOverlay}>
                <View style={styles.editCard}>
                  <Text style={styles.editTitle}>Edit {editCommentLabel}</Text>
                  <TextInput
                    value={editCommentContent}
                    onChangeText={setEditCommentContent}
                    multiline
                    style={styles.editInput}
                    textAlignVertical="top"
                  />
                  <View style={styles.editActions}>
                    <Button
                      label="Cancel"
                      kind="quiet"
                      size="small"
                      style={styles.editButton}
                      onPress={() => {
                        setShowEditCommentModal(false);
                        setEditingCommentId(null);
                        setEditCommentContent('');
                      }}
                    />
                    <Button label="Save" size="small" style={styles.editButton} onPress={submitEditComment} />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.editOverlay}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit Post</Text>
            <TextInput
              value={editContent}
              onChangeText={setEditContent}
              multiline
              style={styles.editInput}
              textAlignVertical="top"
            />
            <View style={styles.editActions}>
              <Button
                label="Cancel"
                kind="quiet"
                size="small"
                style={styles.editButton}
                onPress={() => setShowEditModal(false)}
              />
              <Button label="Save" size="small" style={styles.editButton} onPress={submitEditPost} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewerVisible} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerContainer}>
          <View style={[styles.viewerHeader, { top: insets.top + 6 }]}>
            <Text style={styles.viewerCount}>
              {viewerIndex + 1} / {imageMedia.length}
            </Text>
            <CircleButton
              icon="close"
              kind="dark"
              onPress={() => setViewerVisible(false)}
              accessibilityLabel="Close photo"
            />
          </View>
          <FlatList
            ref={fullscreenRef}
            data={imageMedia}
            horizontal
            pagingEnabled
            keyExtractor={(item, index) => `full-${item.id || item.media_url}-${index}`}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            initialScrollIndex={viewerIndex}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setViewerIndex(index);
            }}
            renderItem={({ item }) => (
              <View style={styles.viewerPage}>
                <Image source={{ uri: item.media_url }} style={styles.viewerImage} resizeMode="contain" />
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
};

const REACTION_HIT_SLOP = { top: 10, bottom: 10, left: 6, right: 6 };
const OPTIONS_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
  /* The post card. It brings its own side margins, so a list of cards only needs the grey page behind it. */
  card: {
    marginHorizontal: GUTTER,
    marginBottom: CARD_GAP,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, paddingTop: 12, paddingBottom: 8, gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  userName: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  metaSeparator: { color: colors.inkMuted, fontSize: 13 },
  groupBadgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 170, minHeight: 20 },
  groupBadge: { color: colors.azureText, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  timeAgo: { color: colors.inkMuted, fontSize: 13 },
  optionsBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  content: { fontSize: 16, lineHeight: 23, color: colors.ink, paddingHorizontal: 16, paddingTop: 0, marginBottom: 10 },
  readMoreBtn: { paddingHorizontal: 16, marginTop: -6, marginBottom: 10, minHeight: 28, justifyContent: 'center' },
  readMore: { color: colors.azureText, fontSize: 15, fontWeight: '500' },
  linkPreviewCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: colors.page,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkPreviewTextWrap: { flex: 1 },
  linkPreviewLabel: { fontSize: 12, color: colors.azureText, fontWeight: '600' },
  linkPreviewTitle: { fontSize: 15, color: colors.ink, marginTop: 2, fontWeight: '600' },
  linkPreviewDescription: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  linkPreviewHint: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  galleryWrap: { marginBottom: 2 },
  postImage: { width: MEDIA_WIDTH, backgroundColor: colors.fillSoft },
  postVideoWrap: { width: MEDIA_WIDTH, backgroundColor: colors.black },
  postVideo: { width: MEDIA_WIDTH, aspectRatio: 16 / 9, backgroundColor: colors.black },
  galleryDots: {
    position: 'absolute',
    bottom: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { backgroundColor: colors.white, width: 8, height: 8, borderRadius: 4 },

  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TAP, minWidth: TAP, paddingHorizontal: 10, justifyContent: 'center' },
  actionsSpacer: { flex: 1 },
  actionCount: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  actionCountOn: { color: colors.ink },
  /* The artwork has empty space around the hands, so it is drawn larger and pulled back in. */
  prayIcon: { width: 31, height: 31, margin: -4 },
  prayIconSmall: { width: 25, height: 25, margin: -3 },

  /* Comments and replies */
  sheetRoot: { flex: 1, backgroundColor: colors.card },
  commentModal: { flex: 1, backgroundColor: colors.card },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerSpacer: { width: TAP, height: TAP },
  commentTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  commentList: { paddingVertical: 6, flexGrow: 1 },
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  commentHighlighted: { backgroundColor: colors.azureTint },
  commentBody: { flex: 1, minWidth: 0 },
  commentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentOptionsBtn: { marginLeft: 'auto', paddingHorizontal: 2, paddingVertical: 2 },
  commentUser: { fontSize: 15, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  commentTime: { fontSize: 13, color: colors.inkMuted },
  commentContent: { fontSize: 16, lineHeight: 22, marginTop: 2, paddingTop: 0, color: colors.ink },
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, minHeight: 24 },
  commentReactions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  reactionItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 24, minHeight: 24 },
  reactionCount: { color: colors.inkMuted, fontSize: 13, fontWeight: '600' },
  replyAction: { minHeight: 24, justifyContent: 'center' },
  replyActionText: { color: colors.azureText, fontSize: 14, fontWeight: '600' },
  replyParent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.page,
  },
  replyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 40, paddingRight: 16, paddingVertical: 10 },
  emptyComments: { textAlign: 'center', paddingHorizontal: 32, paddingVertical: 44, color: colors.inkMuted, fontSize: 15 },
  commentsLoading: { paddingVertical: 44 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: 20,
    backgroundColor: colors.fillSoft,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    color: colors.ink,
  },
  readOnlySelectableText: {
    includeFontPadding: false,
    backgroundColor: 'transparent',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.azure,
  },
  sendBtnDisabled: { backgroundColor: colors.fill },

  /* Edit a post, a comment or a reply */
  editOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: 20 },
  inlineEditOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: 20,
  },
  editCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 16 },
  editTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2, marginBottom: 12, color: colors.ink },
  editInput: {
    minHeight: 120,
    borderRadius: radius.md,
    backgroundColor: colors.fillSoft,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  editActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  editButton: { minHeight: 40, borderRadius: 20, paddingHorizontal: 20 },

  /* Full-screen photos */
  viewerContainer: { flex: 1, backgroundColor: colors.black },
  viewerHeader: {
    position: 'absolute',
    left: 12,
    right: 8,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerCount: { color: colors.white, fontSize: 15, fontWeight: '600', marginLeft: 6 },
  viewerPage: { width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: SCREEN_WIDTH, height: '100%' },
});
