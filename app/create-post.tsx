import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'https://appmychurch.com/api/v1';

export default function CreatePostScreen() {
  const router = useRouter();
  const { token, user, appData } = useAuth();

  const [content, setContent] = useState('');
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canPost = Boolean(appData?.canAllUsersPost || user?.is_admin);

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to attach media.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      setAsset(result.assets[0]);
    }
  };

  const getExtensionFromMime = (mimeType: string) => {
    const parts = mimeType.split('/');
    return parts.length > 1 ? parts[1] : 'bin';
  };

  const uploadMediaIfNeeded = async () => {
    if (!asset) return null;

    const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const isVideo = mimeType.startsWith('video/');
    const extension = getExtensionFromMime(mimeType);
    const fileName = `${user?.id || 'church-user'}-${Date.now()}.${extension}`;
    const bucket = isVideo ? 'amc_video_bucket' : 'amc_image_bucket';

    const signedRes = await axios.post(
      `${API_URL}/uploads/signed-url`,
      {
        files: [{ name: fileName, type: mimeType, bucket }],
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const signedUrl = signedRes.data?.signedUrls?.[0]?.url;
    if (!signedUrl) throw new Error('Failed to get upload URL');

    const fileResponse = await fetch(asset.uri);
    const blob = await fileResponse.blob();

    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error('Media upload failed');
    }

    return {
      media_key: fileName,
      media_url: `https://storage.googleapis.com/${bucket}/${fileName}`,
      media_size: String(asset.fileSize || 0),
      media_type: mimeType,
    };
  };

  const submitPost = async () => {
    if (!token) {
      Alert.alert('Error', 'You must be logged in to post.');
      return;
    }
    if (!canPost) {
      Alert.alert('Not allowed', 'Posting is limited to admins in this group.');
      return;
    }
    if (!content.trim() && !asset) {
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
          media: uploaded ? [uploaded] : [],
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

  const postDisabled = isSubmitting || (!content.trim() && !asset);

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

        {asset ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Attachment selected</Text>
            {asset.type === 'image' ? (
              <Image source={{ uri: asset.uri }} style={styles.previewImage} />
            ) : (
              <Text style={styles.previewFileName}>{asset.fileName || 'Video selected'}</Text>
            )}
            <TouchableOpacity onPress={() => setAsset(null)} style={styles.removeAttachmentBtn}>
              <Text style={styles.removeAttachmentText}>Remove Attachment</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.attachBtn} onPress={pickMedia} disabled={isSubmitting}>
            <MaterialIcons name="image" size={20} color="#007AFF" />
            <Text style={styles.attachText}>Photo/Video</Text>
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
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
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
  previewImage: { width: '100%', height: 220, borderRadius: 10 },
  previewFileName: { fontSize: 14, color: '#333' },
  removeAttachmentBtn: { marginTop: 8 },
  removeAttachmentText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
});
