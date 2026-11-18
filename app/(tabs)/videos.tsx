import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import Navbar from '../../components/Navbar';
import { Button, EmptyState, GroupLabel, Loading, SheetHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { CARD_GAP, colors, GUTTER, radius, shapes, TAP, text } from '../../lib/theme';

const DIRECT_MEDIA_REGEX = /\.(mp4|m4v|mov|webm|m3u8|mp3|m4a|aac|wav|ogg)(\?.*)?$/i;
const isDirectMediaUrl = (url: string) => DIRECT_MEDIA_REGEX.test(url.trim());
const ensureHttpUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

type LinkMetadata = {
  title?: string;
  description?: string;
  author?: string;
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const getMetaContent = (html: string, key: string) => {
  const escapedKey = key.replace(':', '\\:');
  const byProperty = new RegExp(
    `<meta[^>]+property=["']${escapedKey}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const byName = new RegExp(
    `<meta[^>]+name=["']${escapedKey}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const propertyMatch = html.match(byProperty);
  if (propertyMatch?.[1]) return decodeHtml(propertyMatch[1].trim());
  const nameMatch = html.match(byName);
  if (nameMatch?.[1]) return decodeHtml(nameMatch[1].trim());
  return '';
};

const fetchLinkMetadata = async (rawUrl: string): Promise<LinkMetadata> => {
  const url = ensureHttpUrl(rawUrl.trim());
  const normalized = url.toLowerCase();

  try {
    if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (res.ok) {
        const data: any = await res.json();
        return {
          title: data?.title || '',
          author: data?.author_name || '',
          description: '',
        };
      }
    }

    if (normalized.includes('vimeo.com')) {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data: any = await res.json();
        return {
          title: data?.title || '',
          author: data?.author_name || '',
          description: data?.description || '',
        };
      }
    }
  } catch (error) {
    console.warn('oEmbed metadata fetch failed:', error);
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const html = await res.text();

    const ogTitle = getMetaContent(html, 'og:title');
    const ogDescription = getMetaContent(html, 'og:description');
    const metaAuthor = getMetaContent(html, 'author') || getMetaContent(html, 'og:site_name');
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';

    return {
      title: ogTitle || decodeHtml(titleTag),
      description: ogDescription,
      author: metaAuthor,
    };
  } catch (error) {
    console.warn('HTML metadata fetch failed:', error);
    return {};
  }
};

const API_URL = 'https://appmychurch.com/api/v1';
const DEFAULT_THUMBNAIL = 'https://appmychurch.com/appuser/content.jpg';
const PAGE_SIZE = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 15", with the year added once it is no longer this year. Empty when the date cannot be read. */
const formatAddedDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === new Date().getFullYear() ? label : `${label}, ${date.getFullYear()}`;
};

type VideoItem = {
  id: string;
  title: string;
  content: string | null;
  author: string | null;
  mediaUrl: string | null;
  shareLink: string | null;
  mediaKey: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  mediaType: string | null;
  media_size: string | null;
  createdAt: string;
  updatedAt: string;
  playlistId: string | null;
};

type Playlist = {
  id: string;
  order: number;
  name: string;
  app_id: string;
};

function ManagedVideoPlayer({
  uri,
  style,
  contentFit = 'contain',
  shouldPlay = false,
}: {
  uri: string;
  style: any;
  contentFit?: 'contain' | 'cover' | 'fill';
  shouldPlay?: boolean;
}) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();

    return () => player.pause();
  }, [player, shouldPlay, uri]);

  return <VideoView player={player} style={style} contentFit={contentFit} nativeControls />;
}

export default function VideosScreen() {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [newPlaylistId, setNewPlaylistId] = useState('');
  const [thumbnailAsset, setThumbnailAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [showCreatePlaylistPicker, setShowCreatePlaylistPicker] = useState(false);

  const fetchVideos = async (pageNum: number, reset: boolean, playlistId?: string) => {
    try {
      if (reset) setLoading(true);
      else setIsLoadingMore(true);

      const appId = await AsyncStorage.getItem('appId');
      if (!appId || !token) {
        setVideos([]);
        return;
      }

      let url = `${API_URL}/videos?appId=${appId}&page=${pageNum}&limit=${PAGE_SIZE}`;
      if (playlistId) url += `&playlistId=${playlistId}`;

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = Array.isArray(res.data) ? res.data : [];
      if (reset) {
        setVideos(data);
      } else {
        setVideos((prev) => {
          const ids = new Set(prev.map((v) => v.id));
          return [...prev, ...data.filter((v: VideoItem) => !ids.has(v.id))];
        });
      }
      setPage(pageNum);
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      console.error('Fetch videos error:', error);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      setRefreshing(false);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const appId = await AsyncStorage.getItem('appId');
      if (!appId || !token) return;

      const res = await axios.get(`${API_URL}/playlists?appId=${appId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlaylists(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Fetch playlists error:', error);
    }
  };

  useEffect(() => {
    if (token) {
      fetchVideos(1, true, selectedPlaylistId || undefined);
      fetchPlaylists();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchVideos(1, true, selectedPlaylistId || undefined);
    }
  }, [selectedPlaylistId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVideos(1, true, selectedPlaylistId || undefined);
  };

  const onEndReached = () => {
    if (loading || isLoadingMore || !hasMore) return;
    fetchVideos(page + 1, false, selectedPlaylistId || undefined);
  };

  const isAudio = (item: VideoItem) => item.mediaType?.startsWith('audio/');

  // --- Create Video helpers ---

  const resetCreateForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewAuthor('');
    setNewMediaUrl('');
    setIsFetchingMetadata(false);
    setNewPlaylistId('');
    setThumbnailAsset(null);
    setEditingVideoId(null);
  };

  const openEditVideo = (item: VideoItem) => {
    setNewTitle(item.title);
    setNewDescription(item.content?.replace(/<[^>]*>/g, '') || '');
    setNewAuthor(item.author || '');
    setNewMediaUrl(item.mediaUrl || item.shareLink || '');
    setNewPlaylistId(item.playlistId || '');
    setThumbnailAsset(null);
    setEditingVideoId(item.id);
    setShowCreateModal(true);
  };

  const getExtensionFromMime = (mimeType: string) => {
    const parts = mimeType.split('/');
    return parts.length > 1 ? parts[1] : 'bin';
  };

  const pickThumbnail = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to attach a thumbnail.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setThumbnailAsset(result.assets[0]);
    }
  };

  const uploadThumbnailIfNeeded = async () => {
    if (!thumbnailAsset || !token) return null;

    const mimeType = thumbnailAsset.mimeType || 'image/jpeg';
    const extension = getExtensionFromMime(mimeType);
    const fileName = `${user?.id || 'church-user'}-video-thumb-${Date.now()}.${extension}`;
    const bucket = 'amc_image_bucket';

    const signedRes = await axios.post(
      `${API_URL}/uploads/signed-url`,
      { files: [{ name: fileName, type: mimeType, bucket }] },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const signedUrl = signedRes.data?.signedUrls?.[0]?.url;
    if (!signedUrl) throw new Error('Failed to get upload URL');

    const fileResponse = await fetch(thumbnailAsset.uri);
    const blob = await fileResponse.blob();

    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });

    if (!uploadResponse.ok) throw new Error('Thumbnail upload failed');

    return {
      image_key: fileName,
      image_url: `https://storage.googleapis.com/${bucket}/${fileName}`,
    };
  };

  const submitVideo = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a video title.');
      return;
    }
    if (!newMediaUrl.trim()) {
      Alert.alert('Missing URL', 'Please enter a video or audio URL.');
      return;
    }
    if (!token) {
      Alert.alert('Unauthorized', 'Please log in again.');
      return;
    }

    const appId = await AsyncStorage.getItem('appId');
    if (!appId) {
      Alert.alert('Missing App', 'No church app selected.');
      return;
    }

    setIsCreating(true);
    try {
      const uploaded = await uploadThumbnailIfNeeded();
      const inputLink = newMediaUrl.trim();
      const mediaUrl = isDirectMediaUrl(inputLink) ? inputLink : null;
      const shareLink = mediaUrl ? null : inputLink;
      const payload: any = {
        title: newTitle.trim(),
        content: newDescription.trim() || null,
        author: newAuthor.trim() || null,
        mediaUrl,
        shareLink,
        appId,
        playlistId: newPlaylistId || null,
        thumbnail: uploaded,
      };

      if (editingVideoId) {
        await axios.patch(`${API_URL}/videos/${editingVideoId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_URL}/videos`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      setShowCreateModal(false);
      resetCreateForm();
      fetchVideos(1, true, selectedPlaylistId || undefined);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to save video.';
      Alert.alert(editingVideoId ? 'Edit Video' : 'Add Video', message);
    } finally {
      setIsCreating(false);
    }
  };

  const prefillFromShareLink = async () => {
    const inputLink = newMediaUrl.trim();
    if (!inputLink) return;
    setIsFetchingMetadata(true);
    try {
      const metadata = await fetchLinkMetadata(inputLink);
      if (!newTitle.trim() && metadata.title) setNewTitle(metadata.title);
      if (!newDescription.trim() && metadata.description) setNewDescription(metadata.description);
      if (!newAuthor.trim() && metadata.author) setNewAuthor(metadata.author);
    } finally {
      setIsFetchingMetadata(false);
    }
  };

  const deleteVideo = async () => {
    if (!editingVideoId) return;
    if (!token) {
      Alert.alert('Unauthorized', 'Please log in again.');
      return;
    }

    setIsDeleting(true);
    try {
      await axios.delete(`${API_URL}/videos/${editingVideoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowCreateModal(false);
      resetCreateForm();
      fetchVideos(1, true, selectedPlaylistId || undefined);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to delete video.';
      Alert.alert('Delete Video', message);
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteVideo = () => {
    if (!editingVideoId) return;
    Alert.alert(
      'Delete Video',
      'Are you sure you want to delete this video? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteVideo },
      ]
    );
  };

  const getCreatePlaylistName = () => {
    if (!newPlaylistId) return 'None';
    const pl = playlists.find((p) => p.id === newPlaylistId);
    return pl ? pl.name : 'None';
  };

  // --- Render helpers ---

  const renderVideoCard = ({ item }: { item: VideoItem }) => {
    const thumbnail = item.imageUrl && item.imageUrl !== 'null' ? item.imageUrl : DEFAULT_THUMBNAIL;
    const canOpen = Boolean(item.mediaUrl || item.shareLink);
    const opensElsewhere = Boolean(item.shareLink || (item.mediaUrl && !isDirectMediaUrl(item.mediaUrl)));
    const overlayIcon = opensElsewhere ? 'open-outline' : isAudio(item) ? 'musical-notes' : 'play';
    const playlistName = item.playlistId ? playlists.find((p) => p.id === item.playlistId)?.name : '';
    const details = [item.author?.trim(), playlistName, formatAddedDate(item.createdAt)]
      .filter(Boolean)
      .join(' · ');

    return (
      <View style={shapes.card}>
        <TouchableOpacity
          onPress={async () => {
            if (item.mediaUrl) {
              if (isDirectMediaUrl(item.mediaUrl)) {
                setActiveVideo(item);
                return;
              }
              try {
                await Linking.openURL(ensureHttpUrl(item.mediaUrl));
              } catch (error) {
                console.error('Open media link error:', error);
                Alert.alert('Video Link', 'Could not open this link.');
              }
              return;
            }
            if (item.shareLink) {
              try {
                await Linking.openURL(ensureHttpUrl(item.shareLink));
              } catch (error) {
                console.error('Open share link error:', error);
                Alert.alert('Video Link', 'Could not open this link.');
              }
            }
          }}
          activeOpacity={item.mediaUrl || item.shareLink ? 0.7 : 1}
          accessibilityRole={canOpen ? 'button' : undefined}
          accessibilityLabel={canOpen ? `Play ${item.title}` : item.title}
        >
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
          {(item.mediaUrl || item.shareLink) && (
            <View style={[StyleSheet.absoluteFill, styles.playOverlay]}>
              <View style={styles.playButton}>
                <Ionicons
                  name={overlayIcon}
                  size={24}
                  color={colors.ink}
                  style={overlayIcon === 'play' ? styles.playIcon : null}
                />
              </View>
            </View>
          )}
        </TouchableOpacity>
        <View style={[styles.videoInfo, user?.is_admin ? styles.videoInfoWithOptions : null]}>
          <View style={styles.videoText}>
            <Text style={text.headline} numberOfLines={2}>{item.title}</Text>
            {details ? (
              <Text style={text.secondary} numberOfLines={1}>{details}</Text>
            ) : null}
            {/* A video that opens in the browser has no player screen, so this is the only place its description shows. */}
            {item.content ? (
              <Text style={[text.secondary, { color: colors.inkSoft, marginTop: 2 }]} numberOfLines={2}>
                {item.content.replace(/<[^>]*>/g, '')}
              </Text>
            ) : null}
          </View>
          {user?.is_admin && (
            <TouchableOpacity
              style={styles.videoOptionsBtn}
              onPress={() => {
                Alert.alert('Video Options', 'Choose an action', [
                  { text: 'Edit Video', onPress: () => openEditVideo(item) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              accessibilityRole="button"
              accessibilityLabel="Video options"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.inkMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const ListFooter = () => (
    <>
      {isLoadingMore && (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.azure} />
          <Text style={styles.footerText}>Loading more videos...</Text>
        </View>
      )}
      {!hasMore && videos.length > 0 && (
        <View style={styles.footerLoader}>
          <Text style={styles.footerText}>No more videos</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={shapes.page}>
      <Navbar
        title="Videos"
        onAdd={user?.is_admin ? () => setShowCreateModal(true) : undefined}
        addLabel="Add video"
      />

      {playlists.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillRow}
        >
          <PlaylistPill label="All" selected={!selectedPlaylistId} onPress={() => setSelectedPlaylistId('')} />
          {playlists.map((pl) => (
            <PlaylistPill
              key={pl.id}
              label={pl.name}
              selected={selectedPlaylistId === pl.id}
              onPress={() => setSelectedPlaylistId(pl.id)}
            />
          ))}
        </ScrollView>
      )}

      {loading && !refreshing ? (
        <Loading />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={renderVideoCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.inkMuted} />}
          ListFooterComponent={ListFooter}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState icon="videocam-outline" title="No videos yet" hint="New videos will show up here." />
          }
        />
      )}

      {/* Video Player Modal */}
      <Modal visible={!!activeVideo} animationType="slide" onRequestClose={() => setActiveVideo(null)}>
        <View style={styles.playerModal}>
          <View style={[styles.playerHeader, { paddingTop: insets.top + 4 }]}>
            <TouchableOpacity
              style={styles.playerClose}
              onPress={() => { setActiveVideo(null); }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>
          </View>

          {activeVideo?.mediaUrl && (
            isAudio(activeVideo) ? (
              <View style={styles.audioContainer}>
                <Ionicons name="musical-notes" size={80} color={colors.azure} />
                <ManagedVideoPlayer uri={activeVideo.mediaUrl} style={styles.audioPlayer} shouldPlay />
              </View>
            ) : (
              <ManagedVideoPlayer
                uri={activeVideo.mediaUrl}
                style={styles.videoPlayerFull}
                contentFit="contain"
                shouldPlay
              />
            )
          )}

          <View style={styles.playerDetails}>
            <Text style={styles.playerTitle}>{activeVideo?.title}</Text>
            {activeVideo?.content ? (
              <Text style={styles.playerDescription}>
                {activeVideo.content.replace(/<[^>]*>/g, '')}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Create Video Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        onRequestClose={() => { setShowCreateModal(false); resetCreateForm(); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={shapes.page}>
          <SheetHeader
            title={editingVideoId ? 'Edit Video' : 'Add Video'}
            onCancel={() => { setShowCreateModal(false); resetCreateForm(); }}
            actionLabel={editingVideoId ? 'Save' : 'Add'}
            onAction={submitVideo}
            actionLoading={isCreating}
          />

          <ScrollView
            contentContainerStyle={styles.createBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <GroupLabel style={styles.formLabel}>Link</GroupLabel>
            <TextInput
              style={[shapes.input, styles.field]}
              placeholder="Share Link / Link to Video *"
              placeholderTextColor={colors.inkFaint}
              value={newMediaUrl}
              onChangeText={setNewMediaUrl}
              onBlur={prefillFromShareLink}
              autoCapitalize="none"
              keyboardType="url"
            />
            {isFetchingMetadata ? (
              <View style={styles.metaLoadingRow}>
                <ActivityIndicator size="small" color={colors.azure} />
                <Text style={text.footnote}>Fetching link metadata...</Text>
              </View>
            ) : null}

            <GroupLabel style={styles.formLabel}>Details</GroupLabel>
            <TextInput
              style={[shapes.input, styles.field]}
              placeholder="Title *"
              placeholderTextColor={colors.inkFaint}
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={[shapes.input, styles.field, styles.multiline]}
              placeholder="Description"
              placeholderTextColor={colors.inkFaint}
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
            />
            <TextInput
              style={[shapes.input, styles.field]}
              placeholder="Author"
              placeholderTextColor={colors.inkFaint}
              value={newAuthor}
              onChangeText={setNewAuthor}
            />

            {playlists.length > 0 && (
              <TouchableOpacity
                style={[styles.formPickerField, styles.field]}
                onPress={() => setShowCreatePlaylistPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Playlist, ${getCreatePlaylistName()}`}
              >
                <Text style={styles.formPickerLabel}>Playlist</Text>
                <Text style={styles.formPickerValue} numberOfLines={1}>{getCreatePlaylistName()}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </TouchableOpacity>
            )}

            <GroupLabel style={styles.formLabel}>Thumbnail</GroupLabel>
            <Button kind="plain" icon="image-outline" label="Attach Thumbnail" onPress={pickThumbnail} />

            {thumbnailAsset && (
              <View style={[shapes.card, styles.previewCard]}>
                <Image source={{ uri: thumbnailAsset.uri }} style={styles.previewImage} />
                <TouchableOpacity
                  onPress={() => setThumbnailAsset(null)}
                  style={styles.removeAttachmentBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.removeAttachmentText}>Remove Thumbnail</Text>
                </TouchableOpacity>
              </View>
            )}

            {editingVideoId ? (
              <Button
                kind="danger"
                label="Delete Video"
                onPress={confirmDeleteVideo}
                loading={isDeleting}
                style={styles.deleteBtn}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Playlist picker inside create modal */}
        <Modal
          visible={showCreatePlaylistPicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowCreatePlaylistPicker(false)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowCreatePlaylistPicker(false)}
          >
            <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
              <Text style={[text.headline, styles.pickerTitle]}>Select Playlist</Text>
              <ScrollView>
                <TouchableOpacity
                  style={styles.pickerOption}
                  onPress={() => { setNewPlaylistId(''); setShowCreatePlaylistPicker(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !newPlaylistId }}
                >
                  <Text style={[styles.pickerOptionText, !newPlaylistId && styles.pickerOptionTextActive]}>
                    None
                  </Text>
                  {!newPlaylistId ? <Ionicons name="checkmark" size={20} color={colors.azure} /> : null}
                </TouchableOpacity>
                {playlists.map((pl) => (
                  <React.Fragment key={pl.id}>
                    <View style={[shapes.divider, styles.pickerDivider]} />
                    <TouchableOpacity
                      style={styles.pickerOption}
                      onPress={() => { setNewPlaylistId(pl.id); setShowCreatePlaylistPicker(false); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: newPlaylistId === pl.id }}
                    >
                      <Text style={[styles.pickerOptionText, newPlaylistId === pl.id && styles.pickerOptionTextActive]}>
                        {pl.name}
                      </Text>
                      {newPlaylistId === pl.id ? <Ionicons name="checkmark" size={20} color={colors.azure} /> : null}
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>
    </View>
  );
}

/** One choice in the row of playlists under the header. The pill is 34 high; the area that takes the tap is 44. */
function PlaylistPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.pillHit}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <View style={[styles.pill, selected ? styles.pillOn : null]}>
        <Text style={[styles.pillText, selected ? styles.pillTextOn : null]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // A horizontal scroll view in a column gives up height to the list below it
  // unless told not to, which cut the bottom off the pills.
  pillScroll: { flexGrow: 0, flexShrink: 0, minHeight: TAP + 2 },
  pillRow: { paddingHorizontal: GUTTER, paddingTop: 2, gap: 8 },
  pillHit: { height: TAP, justifyContent: 'center' },
  pill: {
    height: 34,
    maxWidth: 260,
    borderRadius: 17,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  pillOn: { backgroundColor: colors.ink },
  pillText: { ...text.buttonSmall, fontWeight: '500', color: colors.ink },
  pillTextOn: { fontWeight: '600', color: colors.white },

  listContent: { paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 24, gap: CARD_GAP },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.fill },
  playOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The triangle looks off-centre in a circle unless it is nudged to the right. */
  playIcon: { marginLeft: 3 },
  videoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 12,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 16,
  },
  videoInfoWithOptions: { paddingRight: 6 },
  videoText: { flex: 1, minWidth: 0, gap: 3 },
  videoOptionsBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { ...text.footnote, marginTop: 4 },

  playerModal: { flex: 1, backgroundColor: colors.black },
  playerHeader: {
    paddingHorizontal: 8,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  playerClose: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  videoPlayerFull: {
    width: '100%',
    height: SCREEN_WIDTH * 0.56,
  },
  audioContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 20,
  },
  audioPlayer: {
    width: '90%',
    height: 60,
  },
  playerDetails: { padding: GUTTER },
  playerTitle: { ...text.section, color: colors.white },
  playerDescription: { ...text.body, marginTop: 10, color: colors.white, opacity: 0.75 },

  createBody: { paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 180, flexGrow: 1 },
  formLabel: { marginTop: 10 },
  field: { marginBottom: 10 },
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  /* A row that opens a list, in the same shape as `shapes.input`. */
  formPickerField: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formPickerLabel: { fontSize: 17, color: colors.ink },
  formPickerValue: { flex: 1, textAlign: 'right', fontSize: 17, color: colors.inkMuted },
  metaLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: GUTTER, marginBottom: 10 },
  previewCard: { marginTop: CARD_GAP },
  previewImage: { width: '100%', height: 180 },
  removeAttachmentBtn: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  removeAttachmentText: { ...text.link, color: colors.red },
  deleteBtn: { marginTop: 28 },

  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingTop: 18,
    paddingBottom: 8,
    width: '80%',
    maxWidth: 360,
    maxHeight: '60%',
    overflow: 'hidden',
  },
  pickerTitle: { paddingHorizontal: 20, marginBottom: 8 },
  pickerOption: {
    minHeight: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerOptionText: { ...text.body, flex: 1 },
  pickerOptionTextActive: { fontWeight: '600' },
  pickerDivider: { marginLeft: 20 },
});
