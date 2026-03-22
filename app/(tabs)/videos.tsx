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
import { MaterialIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../context/AuthContext';

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
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

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

  const getSelectedPlaylistName = () => {
    if (!selectedPlaylistId) return 'All Videos';
    const pl = playlists.find((p) => p.id === selectedPlaylistId);
    return pl ? pl.name : 'All Videos';
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

    return (
      <View style={styles.videoCard}>
        {user?.is_admin && (
          <TouchableOpacity
            style={styles.videoOptionsBtn}
            onPress={() => {
              Alert.alert('Video Options', 'Choose an action', [
                { text: 'Edit Video', onPress: () => openEditVideo(item) },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <MaterialIcons name="more-vert" size={22} color="#374151" />
          </TouchableOpacity>
        )}
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
        >
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
          {(item.mediaUrl || item.shareLink) && (
            <View style={styles.playOverlay}>
              <MaterialIcons
                name={(item.shareLink || (item.mediaUrl && !isDirectMediaUrl(item.mediaUrl)))
                  ? 'open-in-new'
                  : isAudio(item)
                    ? 'audiotrack'
                    : 'play-circle-filled'}
                size={48}
                color="rgba(255,255,255,0.9)"
              />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          {item.content ? (
            <Text style={styles.videoDescription} numberOfLines={2}>
              {item.content.replace(/<[^>]*>/g, '')}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const ListFooter = () => (
    <>
      {isLoadingMore && (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#007AFF" />
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
    <View style={styles.container}>
      <Navbar />
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Videos</Text>
          {user?.is_admin && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowCreateModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        {playlists.length > 0 && (
          <TouchableOpacity
            style={styles.playlistSelector}
            onPress={() => setShowPlaylistPicker(true)}
          >
            <Text style={styles.playlistSelectorText}>{getSelectedPlaylistName()}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#374151" />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={renderVideoCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListFooterComponent={ListFooter}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="videocam-off" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No Videos Added Yet</Text>
            </View>
          }
        />
      )}

      {/* Playlist Picker Modal */}
      <Modal visible={showPlaylistPicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowPlaylistPicker(false)}
        >
          <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>Select Playlist</Text>
            <TouchableOpacity
              style={[styles.pickerOption, !selectedPlaylistId && styles.pickerOptionActive]}
              onPress={() => { setSelectedPlaylistId(''); setShowPlaylistPicker(false); }}
            >
              <Text style={[styles.pickerOptionText, !selectedPlaylistId && styles.pickerOptionTextActive]}>
                All Videos
              </Text>
            </TouchableOpacity>
            {playlists.map((pl) => (
              <TouchableOpacity
                key={pl.id}
                style={[styles.pickerOption, selectedPlaylistId === pl.id && styles.pickerOptionActive]}
                onPress={() => { setSelectedPlaylistId(pl.id); setShowPlaylistPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, selectedPlaylistId === pl.id && styles.pickerOptionTextActive]}>
                  {pl.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Video Player Modal */}
      <Modal visible={!!activeVideo} animationType="slide">
        <View style={styles.playerModal}>
          <View style={styles.playerHeader}>
            <TouchableOpacity onPress={() => { setActiveVideo(null); }}>
              <MaterialIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {activeVideo?.mediaUrl && (
            isAudio(activeVideo) ? (
              <View style={styles.audioContainer}>
                <MaterialIcons name="audiotrack" size={80} color="#007AFF" />
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
      <Modal visible={showCreateModal} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.createModal}>
          <View style={styles.createHeader}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetCreateForm(); }}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={styles.createHeaderTitle}>{editingVideoId ? 'Edit Video' : 'Add Video'}</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.createBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <TextInput
              style={styles.input}
              placeholder="Share Link / Link to Video *"
              value={newMediaUrl}
              onChangeText={setNewMediaUrl}
              onBlur={prefillFromShareLink}
              autoCapitalize="none"
              keyboardType="url"
            />
            {isFetchingMetadata ? (
              <View style={styles.metaLoadingRow}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.metaLoadingText}>Fetching link metadata...</Text>
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Title *"
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Description"
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Author"
              value={newAuthor}
              onChangeText={setNewAuthor}
            />

            {playlists.length > 0 && (
              <TouchableOpacity
                style={styles.formPickerField}
                onPress={() => setShowCreatePlaylistPicker(true)}
              >
                <Text style={styles.formPickerLabel}>Playlist</Text>
                <Text style={styles.formPickerValue}>{getCreatePlaylistName()}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.imageAttachBtn} onPress={pickThumbnail}>
              <MaterialIcons name="image" size={20} color="#007AFF" />
              <Text style={styles.imageAttachText}>Attach Thumbnail</Text>
            </TouchableOpacity>

            {thumbnailAsset && (
              <View style={styles.previewCard}>
                <Image source={{ uri: thumbnailAsset.uri }} style={styles.previewImage} />
                <TouchableOpacity onPress={() => setThumbnailAsset(null)} style={styles.removeAttachmentBtn}>
                  <Text style={styles.removeAttachmentText}>Remove Thumbnail</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.submitBtn} onPress={submitVideo} disabled={isCreating}>
              {isCreating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>{editingVideoId ? 'Save Changes' : 'Add Video'}</Text>
              )}
            </TouchableOpacity>

          </ScrollView>

          {editingVideoId ? (
            <View style={styles.deleteFooter}>
              <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteVideo} disabled={isDeleting}>
                {isDeleting ? (
                  <ActivityIndicator color="#ef4444" />
                ) : (
                  <Text style={styles.deleteBtnText}>Delete Video</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </KeyboardAvoidingView>

        {/* Playlist picker inside create modal */}
        <Modal visible={showCreatePlaylistPicker} animationType="fade" transparent>
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowCreatePlaylistPicker(false)}
          >
            <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
              <Text style={styles.pickerTitle}>Select Playlist</Text>
              <TouchableOpacity
                style={[styles.pickerOption, !newPlaylistId && styles.pickerOptionActive]}
                onPress={() => { setNewPlaylistId(''); setShowCreatePlaylistPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, !newPlaylistId && styles.pickerOptionTextActive]}>
                  None
                </Text>
              </TouchableOpacity>
              {playlists.map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={[styles.pickerOption, newPlaylistId === pl.id && styles.pickerOptionActive]}
                  onPress={() => { setNewPlaylistId(pl.id); setShowCreatePlaylistPicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, newPlaylistId === pl.id && styles.pickerOptionTextActive]}>
                    {pl.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#222' },
  addBtn: {
    backgroundColor: '#007AFF',
    width: 25,
    height: 25,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 },
  videoCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: SCREEN_WIDTH * 0.56,
    backgroundColor: '#f3f4f6',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: SCREEN_WIDTH * 0.56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  videoOptionsBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    padding: 12,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  videoDescription: {
    marginTop: 4,
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  playlistSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  playlistSelectorText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  emptyContainer: { padding: 60, alignItems: 'center', gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 16, fontWeight: '600', textTransform: 'uppercase' },
  footerLoader: { padding: 16, alignItems: 'center' },
  footerText: { color: '#999', fontSize: 13, marginTop: 4 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '80%',
    maxHeight: '60%',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerOptionActive: {
    backgroundColor: '#dbeafe',
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  pickerOptionTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  playerModal: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerHeader: {
    paddingTop: 55,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
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
  playerDetails: {
    padding: 16,
  },
  playerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  playerDescription: {
    marginTop: 10,
    fontSize: 15,
    color: '#d1d5db',
    lineHeight: 22,
  },
  createModal: { flex: 1, backgroundColor: '#fff' },
  createHeader: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  createHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  createBody: { padding: 16, gap: 12, paddingBottom: Platform.OS === 'ios' ? 260 : 180, flexGrow: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  formPickerField: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  formPickerLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  formPickerValue: { fontSize: 15, color: '#111827' },
  imageAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  imageAttachText: { color: '#007AFF', fontWeight: '600' },
  metaLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 2 },
  metaLoadingText: { color: '#6b7280', fontSize: 13 },
  previewCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, backgroundColor: '#fafafa' },
  previewImage: { width: '100%', height: 180, borderRadius: 10 },
  removeAttachmentBtn: { marginTop: 8 },
  removeAttachmentText: { color: '#ef4444', fontWeight: '600' },
  submitBtn: {
    marginTop: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteFooter: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 24 : 16,
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 16 },
});
