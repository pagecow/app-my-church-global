import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View, Text, Image, TouchableOpacity, Pressable, Modal, FlatList, TextInput, Platform, Keyboard, Dimensions, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import axios from 'axios';

// Local prayer hand images
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

  if (postDeleted) return null;

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
        <TouchableOpacity onPress={openPostOptions}>
          <MaterialIcons name="more-vert" size={22} color="#444" />
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
            <TouchableOpacity onPress={() => setExpanded(!expanded)}>
              <Text style={styles.readMore}>{expanded ? 'Read Less...' : 'Read More...'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {sharedUrl ? (
        <TouchableOpacity style={styles.linkPreviewCard} onPress={() => openExternalLink(sharedUrl)} activeOpacity={0.85}>
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
              <Text style={styles.linkPreviewDescription} numberOfLines={2}>{linkPreview.description}</Text>
            ) : null}
            <Text style={styles.linkPreviewHint}>Tap to open</Text>
          </View>
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
              const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveMediaIndex(index);
            }}
            renderItem={({ item, index }) => (
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
                    style={[styles.postImage, { aspectRatio: postImageAspectRatio }]}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )
            )}
          />
          {mediaItems.length > 1 ? (
            <View style={styles.galleryDots}>
              {mediaItems.map((_: any, idx: number) => (
                <View key={`dot-${idx}`} style={[styles.dot, idx === activeMediaIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* Counts row */}
      <View style={styles.countsRow}>
        <View style={styles.countsLeft}>
          {likeCount > 0 && <Text style={styles.countText}>{likeCount} likes</Text>}
          {heartCount > 0 && <Text style={styles.countText}>{heartCount} hearts</Text>}
          {prayCount > 0 && <Text style={styles.countText}>{prayCount} praying</Text>}
        </View>
        {totalCommentCount > 0 && (
          <TouchableOpacity onPress={openComments}>
            <Text style={styles.countText}>
              {formatCountLabel(totalCommentCount, 'comment', 'comments')}
            </Text>
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
      {/* Comment / Reply Modal */}
      <Modal visible={showComments || showReplyThread} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1 }}>
          <View style={styles.commentModal}>
            <View style={styles.commentHeader}>
              {showReplyThread ? (
                <>
                  <TouchableOpacity onPress={() => setShowReplyThread(false)} style={styles.backButton}>
                    <MaterialIcons name="arrow-back" size={24} color="#333" />
                  </TouchableOpacity>
                  <Text style={styles.commentTitle}>Reply thread</Text>
                  <View style={{ width: 40 }} />
                </>
              ) : (
                <>
                  <Text style={styles.commentTitle}>Comments</Text>
                  <TouchableOpacity onPress={() => {
                    setShowComments(false);
                    setShowReplyThread(false);
                    setActiveParentComment(null);
                    setReplyText('');
                  }}>
                    <MaterialIcons name="close" size={28} color="#333" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {showReplyThread && activeParentComment ? (
              <FlatList
                keyboardShouldPersistTaps="always"
                data={activeParentComment.replies || []}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={() => (
                  <View style={styles.replyParentContainer}>
                    <View style={styles.commentItem}>
                      {activeParentComment.church_user?.profile_picture_url ? (
                        <Image source={{ uri: activeParentComment.church_user.profile_picture_url }} style={styles.commentAvatar} />
                      ) : (
                        <View style={[styles.commentAvatar, styles.avatarFallback]}>
                          <Text style={styles.avatarTextSmall}>{(activeParentComment.church_user?.name || '?')[0].toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={styles.commentNameRow}>
                          <Text style={styles.commentUser}>@{activeParentComment.church_user?.name}</Text>
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
                  </View>
                )}
                renderItem={({ item }) => {
                  const isLiked = item.comment_likes?.some((l: any) => l.church_userId === userId);
                  const isHearted = item.comment_hearts?.some((h: any) => h.church_userId === userId);
                  const isPrayed = item.comment_praying?.some((p: any) => p.church_userId === userId);

                  return (
                    <View style={styles.replyItemNested}>
                      {item.church_user?.profile_picture_url ? (
                        <Image source={{ uri: item.church_user.profile_picture_url }} style={styles.replyAvatar} />
                      ) : (
                        <View style={[styles.replyAvatar, styles.avatarFallback]}>
                          <Text style={styles.avatarTextSmall}>{(item.church_user?.name || '?')[0].toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={styles.commentNameRow}>
                          <Text style={styles.commentUser}>{item.church_user?.name}</Text>
                          <Text style={styles.commentTime}>{formatTimeDifference(item.createdAt)}</Text>
                          <TouchableOpacity style={styles.commentOptionsBtn} onPress={() => openCommentOptions(item)}>
                            <MaterialIcons name="more-vert" size={16} color="#555" />
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={[styles.commentContent, styles.readOnlySelectableText]}
                          value={stripHtml(item.content || '')}
                          editable={false}
                          multiline
                          scrollEnabled={false}
                        />
                        <View style={styles.commentReactions}>
                          <View style={styles.reactionItem}>
                            <TouchableOpacity onPress={() => handleCommentLike(item.id, true)}>
                              <MaterialIcons name={isLiked ? 'thumb-up' : 'thumb-up-off-alt'} size={14} color="#3b82f6" />
                            </TouchableOpacity>
                            {item.comment_likes?.length > 0 ? <Text style={styles.reactionCount}>{item.comment_likes.length}</Text> : null}
                          </View>
                          <View style={styles.reactionItem}>
                            <TouchableOpacity onPress={() => handleCommentHeart(item.id, true)}>
                              <MaterialIcons name={isHearted ? 'favorite' : 'favorite-border'} size={14} color="#ef4444" />
                            </TouchableOpacity>
                            {item.comment_hearts?.length > 0 ? <Text style={styles.reactionCount}>{item.comment_hearts.length}</Text> : null}
                          </View>
                          <View style={styles.reactionItem}>
                            <TouchableOpacity onPress={() => handleCommentPray(item.id, true)}>
                              <Image source={isPrayed ? prayingHandFilled : prayingHandOutline} style={{ width: 14, height: 14 }} />
                            </TouchableOpacity>
                            {item.comment_praying?.length > 0 ? <Text style={styles.reactionCount}>{item.comment_praying.length}</Text> : null}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyComments}>No replies yet.</Text>}
              />
            ) : (
              <FlatList
                ref={commentsListRef}
                keyboardShouldPersistTaps="always"
                data={comments}
                keyExtractor={(item) => item.id}
                onScrollToIndexFailed={() => {}}
                renderItem={({ item }) => {
                  const commentText = stripHtml(item.content || '');
                  const highlighted = initialFocusCommentId === item.id;
                  const isLiked = item.comment_likes?.some((l: any) => l.church_userId === userId);
                  const isHearted = item.comment_hearts?.some((h: any) => h.church_userId === userId);
                  const isPrayed = item.comment_praying?.some((p: any) => p.church_userId === userId);

                  return (
                    <View style={[styles.commentItem, highlighted && styles.commentHighlighted]}>
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
                          <TouchableOpacity style={styles.commentOptionsBtn} onPress={() => openCommentOptions(item)}>
                            <MaterialIcons name="more-vert" size={18} color="#555" />
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
                          <View style={styles.commentReactions}>
                            <View style={styles.reactionItem}>
                              <TouchableOpacity onPress={() => handleCommentLike(item.id)}>
                                <MaterialIcons name={isLiked ? 'thumb-up' : 'thumb-up-off-alt'} size={16} color="#3b82f6" />
                              </TouchableOpacity>
                              {item.comment_likes?.length > 0 ? <Text style={styles.reactionCount}>{item.comment_likes.length}</Text> : null}
                            </View>
                            <View style={styles.reactionItem}>
                              <TouchableOpacity onPress={() => handleCommentHeart(item.id)}>
                                <MaterialIcons name={isHearted ? 'favorite' : 'favorite-border'} size={16} color="#ef4444" />
                              </TouchableOpacity>
                              {item.comment_hearts?.length > 0 ? <Text style={styles.reactionCount}>{item.comment_hearts.length}</Text> : null}
                            </View>
                            <View style={styles.reactionItem}>
                              <TouchableOpacity onPress={() => handleCommentPray(item.id)}>
                                <Image source={isPrayed ? prayingHandFilled : prayingHandOutline} style={{ width: 16, height: 16 }} />
                              </TouchableOpacity>
                              {item.comment_praying?.length > 0 ? <Text style={styles.reactionCount}>{item.comment_praying.length}</Text> : null}
                            </View>
                          </View>

                          <TouchableOpacity style={styles.replyAction} onPress={() => openReplyThread(item)}>
                            <Text style={styles.replyActionText}>Reply</Text>
                            {item._count?.replies > 0 && (
                              <Text style={styles.replyCountNumber}>{item._count.replies}</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyComments}>{loadingComments ? 'Loading...' : 'No comments yet. Be the first!'}</Text>
                }
              />
            )}

            <View style={[styles.commentInputRow, keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 30 } : null]}>
              <TextInput
                style={styles.commentInput}
                placeholder={showReplyThread ? 'Add a reply...' : 'Write a comment...'}
                value={showReplyThread ? replyText : newComment}
                onChangeText={showReplyThread ? setReplyText : setNewComment}
                multiline
              />
              <Pressable
                onPressIn={handleSendPress}
                disabled={isSubmittingComment}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                style={styles.sendBtn}
              >
                <MaterialIcons name="send" size={24} color="#3b82f6" />
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
                    <TouchableOpacity
                      onPress={() => {
                        setShowEditCommentModal(false);
                        setEditingCommentId(null);
                        setEditCommentContent('');
                      }}
                    >
                      <Text style={styles.editCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={submitEditComment}>
                      <Text style={styles.editSave}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="fade">
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
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.editCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitEditPost}>
                <Text style={styles.editSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={viewerVisible} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerCount}>{viewerIndex + 1} / {imageMedia.length}</Text>
            <TouchableOpacity onPress={() => setViewerVisible(false)}>
              <MaterialIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
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
  linkPreviewCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 10,
  },
  linkPreviewTextWrap: { flex: 1 },
  linkPreviewLabel: { fontSize: 12, color: '#2563eb', fontWeight: '700' },
  linkPreviewTitle: { fontSize: 13, color: '#1f2937', marginTop: 2, fontWeight: '600' },
  linkPreviewDescription: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  linkPreviewHint: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  galleryWrap: { marginBottom: 8 },
  postImage: { width: SCREEN_WIDTH, backgroundColor: '#000' },
  postVideoWrap: { width: SCREEN_WIDTH, backgroundColor: '#000' },
  postVideo: { width: SCREEN_WIDTH, aspectRatio: 16 / 9, backgroundColor: '#000' },
  galleryDots: {
    position: 'absolute',
    bottom: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4 },
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
  commentHighlighted: { backgroundColor: '#eef5ff' },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentOptionsBtn: { marginLeft: 'auto', padding: 2 },
  commentUser: { fontWeight: '600', fontSize: 14 },
  commentTime: { fontSize: 12, color: '#999' },
  commentContent: { fontSize: 14, lineHeight: 20, marginTop: 4, color: '#333' },
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingRight: 8 },
  commentReactions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reactionItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reactionCount: { color: '#6b7280', fontSize: 11, fontWeight: '600' },
  replyAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyActionText: { color: '#666', fontSize: 13, fontWeight: '600' },
  replyCountNumber: { color: '#666', fontSize: 13 },
  replyParentContainer: { backgroundColor: '#eef2f7', borderBottomWidth: 1, borderBottomColor: '#dee2e6' },
  replyItemNested: { flexDirection: 'row', padding: 12, paddingLeft: 24, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', alignItems: 'flex-start' },
  backButton: { padding: 4 },

  replyCount: { fontSize: 12, color: '#3b82f6', marginTop: 4 },
  replyItem: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  replyAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  emptyComments: { textAlign: 'center', padding: 40, color: '#999' },
  commentInputRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'flex-end',
  },
  replyingBanner: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  replyingText: { color: '#666', fontSize: 12 },
  replyingCancel: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  readOnlySelectableText: {
    includeFontPadding: false,
    backgroundColor: 'transparent',
  },
  sendBtn: { marginLeft: 8, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 },
  inlineEditOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  editCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  editTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10, color: '#222' },
  editInput: { minHeight: 120, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15, color: '#222' },
  editActions: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  editCancel: { color: '#666', fontSize: 15 },
  editSave: { color: '#007AFF', fontSize: 15, fontWeight: '700' },
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  viewerHeader: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerCount: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerPage: { width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: SCREEN_WIDTH, height: '100%' },
});
