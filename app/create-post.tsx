import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'https://appmychurch.com/api/v1';
const UGC_TERMS_ACK_KEY = 'ugcTermsAcceptedGlobalApp_v1';
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;

function VideoPreviewTile({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false;
    player.muted = true;
  });

  return (
    <VideoView
      player={player}
      style={styles.previewThumb}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export default function CreatePostScreen() {
  const router = useRouter();
  const { token, user, appData } = useAuth();

  const [content, setContent] = useState('');
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAcceptedUgcTerms, setHasAcceptedUgcTerms] = useState(false);
  const [isLoadingTermsAck, setIsLoadingTermsAck] = useState(true);

  const canPost = Boolean(appData?.canAllUsersPost || user?.is_admin);

  const loadTermsAck = React.useCallback(async () => {
    try {
      const value = await AsyncStorage.getItem(UGC_TERMS_ACK_KEY);
      setHasAcceptedUgcTerms(value === '1');
    } finally {
      setIsLoadingTermsAck(false);
    }
  }, []);

  useEffect(() => {
    loadTermsAck();
  }, [loadTermsAck]);

  useFocusEffect(
    React.useCallback(() => {
      loadTermsAck();
    }, [loadTermsAck])
  );

  const acceptUgcTerms = async () => {
    await AsyncStorage.setItem(UGC_TERMS_ACK_KEY, '1');
    setHasAcceptedUgcTerms(true);
    Alert.alert('Thanks', 'You can now publish your post.');
  };

  const hasVideoSelected = assets.some((asset) => asset.type === 'video');

  const mergeAssets = (incomingAssets: ImagePicker.ImagePickerAsset[], options?: { maxVideoCount?: number }) => {
    setAssets((prev) => {
      const merged = [...prev, ...incomingAssets];
      const deduped = merged.filter(
        (item, idx, arr) => idx === arr.findIndex((x) => x.uri === item.uri)
      );
      const photoAssets = deduped.filter((asset) => asset.type !== 'video');
      const videoAssets = deduped.filter((asset) => asset.type === 'video');
      const maxVideoCount = options?.maxVideoCount ?? 1;

      if (videoAssets.length > maxVideoCount) {
        Alert.alert('Video limit reached', 'You can attach up to 1 video per post.');
      }

      if (photoAssets.length + Math.min(videoAssets.length, maxVideoCount) > 10) {
        Alert.alert('Limit reached', 'You can attach up to 10 total items per post.');
      }

      return [...photoAssets.slice(0, 10 - Math.min(videoAssets.length, maxVideoCount)), ...videoAssets.slice(0, maxVideoCount)].slice(0, 10);
    });
  };

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to attach media.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.7,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });

    if (!result.canceled && result.assets.length > 0) {
      mergeAssets(result.assets, { maxVideoCount: 1 });
    }
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to attach media.');
      return;
    }

    if (hasVideoSelected) {
      Alert.alert('Video already selected', 'You can attach up to 1 video per post. Remove the current video to choose another.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      quality: 0.7,
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const selectedVideo = result.assets[0];
      if ((selectedVideo.fileSize || 0) > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert('Video too large', 'Videos must be 200 MB or smaller.');
        return;
      }
      mergeAssets(result.assets, { maxVideoCount: 1 });
    }
  };

  const getExtensionFromMime = (mimeType: string) => {
    const parts = mimeType.split('/');
    return parts.length > 1 ? parts[1] : 'bin';
  };

  const uploadMediaIfNeeded = async () => {
    if (assets.length === 0) return [];

    const files = assets.map((asset, index) => {
      const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const extension = getExtensionFromMime(mimeType);
      const fileName = `${user?.id || 'church-user'}-${Date.now()}-${index}.${extension}`;
      return {
        asset,
        fileName,
        mimeType,
        bucket: (asset.type === 'video' ? 'amc_video_bucket' : 'amc_image_bucket') as const,
      };
    });

    const signedRes = await axios.post(
      `${API_URL}/uploads/signed-url`,
      {
        files: files.map((f) => ({ name: f.fileName, type: f.mimeType, bucket: f.bucket })),
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const signedUrls = signedRes.data?.signedUrls || [];
    if (!Array.isArray(signedUrls) || signedUrls.length !== files.length) {
      throw new Error('Failed to get upload URLs');
    }

    const uploaded = await Promise.all(
      files.map(async (file, index) => {
        const signedUrl = signedUrls[index]?.url;
        if (!signedUrl) throw new Error('Missing upload URL');

        const fileResponse = await fetch(file.asset.uri);
        const blob = await fileResponse.blob();

        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.mimeType },
          body: blob,
        });

        if (!uploadResponse.ok) throw new Error('Media upload failed');

        return {
          media_key: file.fileName,
          media_url: `https://storage.googleapis.com/${file.bucket}/${file.fileName}`,
          media_size: String(file.asset.fileSize || 0),
          media_type: file.mimeType,
        };
      })
    );

    return uploaded;
  };

  const submitPost = async () => {
    if (isLoadingTermsAck) {
      Alert.alert('Please wait', 'We are still loading your posting settings.');
      return;
    }
    if (!hasAcceptedUgcTerms) {
      Alert.alert(
        'Terms Required',
        'Before posting, you must agree to the Terms of Use and Community Guidelines.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Terms', onPress: () => router.push('/terms') },
          { text: 'I Agree', onPress: () => void acceptUgcTerms() },
        ]
      );
      return;
    }
    if (!token) {
      Alert.alert('Error', 'You must be logged in to post.');
      return;
    }
    if (!canPost) {
      Alert.alert('Not allowed', 'Posting is limited to admins in this group.');
      return;
    }
    if (!content.trim() && assets.length === 0) {
      Alert.alert('Empty post', 'Add text or attach media before posting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const appId = await AsyncStorage.getItem('appId');
      if (!appId) {
        Alert.alert('Error', 'No group selected. Please re-open the app and try again.');
        setIsSubmitting(false);
        return;
      }

      const uploaded = await uploadMediaIfNeeded();

      await axios.post(
        `${API_URL}/posts`,
        {
          content: content.trim(),
          appId,
          media: uploaded,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await AsyncStorage.setItem('needsHomeRefresh', '1');
      router.back();
    } catch (error: any) {
      console.error('Create post failed:', error?.response?.data || error?.message);
      Alert.alert('Post failed', error?.response?.data?.message || 'Unable to create post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const postDisabled = isSubmitting || isLoadingTermsAck || (!content.trim() && assets.length === 0);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Post</Text>
        <View style={styles.headerRight}>
          <Image
            source={user?.profile_picture_url ? { uri: user.profile_picture_url } : require('../assets/icon.png')}
            style={styles.avatar}
          />
          <TouchableOpacity
            style={[styles.headerPostBtn, postDisabled && styles.headerPostBtnDisabled]}
            onPress={submitPost}
            disabled={postDisabled}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.headerPostBtnText}>Post</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          placeholder="Share your thoughts..."
          value={content}
          onChangeText={setContent}
          multiline
          scrollEnabled
          textAlignVertical="top"
          editable={!isSubmitting}
        />

        {assets.length > 0 ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>
              {assets.length} attachment{assets.length > 1 ? 's' : ''} selected
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
              {assets.map((asset, index) => (
                <View key={`${asset.uri}-${index}`} style={styles.previewThumbWrap}>
                  {asset.type === 'video' ? (
                    <View style={styles.videoThumb}>
                      <VideoPreviewTile uri={asset.uri} />
                      <View style={styles.videoBadge}>
                        <MaterialIcons name="play-circle-filled" size={18} color="#fff" />
                        <Text style={styles.videoBadgeText}>Video</Text>
                      </View>
                    </View>
                  ) : (
                    <Image source={{ uri: asset.uri }} style={styles.previewThumb} />
                  )}
                  <TouchableOpacity
                    onPress={() => setAssets((prev) => prev.filter((_, i) => i !== index))}
                    style={styles.removeThumbBtn}
                  >
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setAssets([])} style={styles.removeAttachmentBtn}>
              <Text style={styles.removeAttachmentText}>Remove All</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!hasAcceptedUgcTerms ? (
          <View style={styles.termsNotice}>
            <Text style={styles.termsNoticeText}>
              You must agree to the Terms of Use and Community Guidelines before your first post.
            </Text>
            <View style={styles.termsBtnRow}>
              <TouchableOpacity style={styles.termsLinkBtn} onPress={() => router.push('/terms')}>
                <Text style={styles.termsLinkBtnText}>Review Terms</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.termsAgreeBtn} onPress={() => void acceptUgcTerms()}>
                <Text style={styles.termsAgreeBtnText}>I Agree</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.attachBtn} onPress={pickPhotos} disabled={isSubmitting}>
            <MaterialIcons name="image" size={20} color="#007AFF" />
            <Text style={styles.attachText}>Add Photo(s)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickVideo} disabled={isSubmitting || hasVideoSelected}>
            <MaterialIcons name="videocam" size={20} color="#007AFF" />
            <Text style={styles.attachText}>Add Video</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 55,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  headerPostBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 62,
    alignItems: 'center',
  },
  headerPostBtnDisabled: { opacity: 0.45 },
  headerPostBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 12 },
  contentContainer: { padding: 16, gap: 14, paddingBottom: 28 },
  input: {
    minHeight: 170,
    maxHeight: 240,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
    color: '#222',
    backgroundColor: '#fff',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  attachText: { color: '#007AFF', fontWeight: '600', fontSize: 15 },
  previewCard: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 10, backgroundColor: '#fafafa' },
  previewLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  termsNotice: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  termsNoticeText: { fontSize: 13, color: '#1f2937', lineHeight: 19 },
  termsBtnRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  termsLinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: 'transparent',
  },
  termsLinkBtnText: { color: '#007AFF', fontSize: 13, fontWeight: '700' },
  termsAgreeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#007AFF',
  },
  termsAgreeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  previewImage: { width: '100%', height: 220, borderRadius: 10 },
  previewFileName: { fontSize: 14, color: '#333' },
  previewRow: { gap: 10 },
  previewThumbWrap: { position: 'relative' },
  previewThumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#f3f4f6' },
  videoThumb: { position: 'relative' },
  videoBadge: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingVertical: 3,
  },
  videoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  removeThumbBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAttachmentBtn: { marginTop: 8 },
  removeAttachmentText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
});
