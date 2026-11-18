import React, { useEffect, useState } from 'react';
import {
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
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Avatar, Button, CircleButton, SheetHeader } from '../components/ui';
import { CARD_GAP, colors, GUTTER, radius, shapes, TAP, text } from '../lib/theme';

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
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = typeof params.groupId === 'string' ? params.groupId : '';

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
        bucket: (asset.type === 'video' ? 'amc_video_bucket' : 'amc_image_bucket') as
          | 'amc_video_bucket'
          | 'amc_image_bucket',
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
    // Posting rights inside a group depend on the member's role there, which
    // only the server can decide. The church-wide gate must not block a group
    // post, or a group owner who is not a church admin could not post.
    if (!canPost && !groupId) {
      Alert.alert('Not allowed', 'Posting is limited to admins in this church.');
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

      // A group post goes to its own route. It must never fall through to
      // /posts, because that path sends the church-wide push.
      const isGroupPost = Boolean(groupId);
      await axios.post(
        isGroupPost ? `${API_URL}/groups/${groupId}/posts` : `${API_URL}/posts`,
        {
          content: content.trim(),
          appId,
          media: uploaded,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Mutually exclusive: a group post may only refresh the group feed.
      await AsyncStorage.setItem(
        isGroupPost ? 'needsGroupsRefresh' : 'needsHomeRefresh',
        '1'
      );
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
      style={shapes.page}
    >
      <SheetHeader
        title="New Post"
        onCancel={() => router.back()}
        actionLabel="Post"
        onAction={submitPost}
        actionLoading={isSubmitting}
        actionDisabled={postDisabled}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={shapes.card}>
          <View style={styles.author}>
            <Avatar uri={user?.profile_picture_url} name={user?.name} size={40} />
            <Text style={[text.headline, styles.authorName]} numberOfLines={1}>
              {user?.name}
            </Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Share your thoughts..."
            placeholderTextColor={colors.inkFaint}
            value={content}
            onChangeText={setContent}
            multiline
            scrollEnabled
            textAlignVertical="top"
            editable={!isSubmitting}
          />

          {assets.length > 0 ? (
            <View>
              <View style={styles.previewHead}>
                <Text style={[text.footnote, styles.previewLabel]}>
                  {assets.length} attachment{assets.length > 1 ? 's' : ''} selected
                </Text>
                <TouchableOpacity
                  onPress={() => setAssets([])}
                  style={styles.removeAll}
                  accessibilityRole="button"
                >
                  <Text style={styles.removeAllText}>Remove All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
                {assets.map((asset, index) => (
                  <View key={`${asset.uri}-${index}`} style={styles.previewThumbWrap}>
                    {asset.type === 'video' ? (
                      <View style={styles.videoThumb}>
                        <VideoPreviewTile uri={asset.uri} />
                        <View style={styles.videoBadge}>
                          <Ionicons name="play" size={12} color={colors.white} />
                          <Text style={styles.videoBadgeText}>Video</Text>
                        </View>
                      </View>
                    ) : (
                      <Image source={{ uri: asset.uri }} style={styles.previewThumb} />
                    )}
                    <CircleButton
                      icon="close"
                      kind="dark"
                      size={24}
                      onPress={() => setAssets((prev) => prev.filter((_, i) => i !== index))}
                      accessibilityLabel="Remove attachment"
                      style={styles.removeThumb}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={[shapes.divider, styles.pickersDivider]} />
          <View style={styles.pickers}>
            <Button
              label="Add Photo(s)"
              icon="image-outline"
              kind="quiet"
              size="small"
              onPress={pickPhotos}
              disabled={isSubmitting}
              style={styles.tapHeight}
            />
            <Button
              label="Add Video"
              icon="videocam-outline"
              kind="quiet"
              size="small"
              onPress={pickVideo}
              disabled={isSubmitting || hasVideoSelected}
              style={styles.tapHeight}
            />
          </View>
        </View>

        {!hasAcceptedUgcTerms ? (
          <View style={[shapes.card, styles.terms]}>
            <Text style={styles.termsText}>
              You must agree to the Terms of Use and Community Guidelines before your first post.
            </Text>
            <View style={styles.termsButtons}>
              <Button
                label="Review Terms"
                kind="quiet"
                size="small"
                onPress={() => router.push('/terms')}
                style={styles.tapHeight}
              />
              <Button
                label="I Agree"
                size="small"
                onPress={() => void acceptUgcTerms()}
                style={styles.tapHeight}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const THUMB = 96;

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 32, gap: CARD_GAP },

  author: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  authorName: { flex: 1 },
  input: {
    ...text.bodyLarge,
    minHeight: 150,
    maxHeight: 240,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },

  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
  },
  previewLabel: { flex: 1 },
  removeAll: { minHeight: TAP, paddingHorizontal: 8, justifyContent: 'center' },
  removeAllText: { fontSize: 15, fontWeight: '600', color: colors.red },
  previewRow: { gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  previewThumbWrap: { position: 'relative' },
  previewThumb: { width: THUMB, height: THUMB, borderRadius: radius.md, backgroundColor: colors.fill },
  /* A video does not always clip to its own rounded corners, so its holder does the clipping. */
  videoThumb: { width: THUMB, height: THUMB, borderRadius: radius.md, overflow: 'hidden' },
  videoBadge: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: radius.pill,
    paddingVertical: 3,
  },
  videoBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  /* The dark circle sits just inside the picture's corner; the area that takes the tap is larger. */
  removeThumb: { position: 'absolute', top: -6, right: -6 },

  pickersDivider: { marginLeft: 16 },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  /* A small button, made tall enough for a finger. */
  tapHeight: { minHeight: TAP, borderRadius: TAP / 2 },

  terms: { padding: 16, gap: 12 },
  termsText: { ...text.secondary, fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  termsButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
