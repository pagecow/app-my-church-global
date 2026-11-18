import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Button, StackHeader } from '../components/ui';
import { colors, GUTTER, shapes, TAP, text } from '../lib/theme';

const API_URL = 'https://appmychurch.com/api/v1';

const AVATAR_SIZE = 112;
const ROW_PADDING = 16;

export default function ProfileScreen() {
  const { user, token, refreshUser, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      uploadImage(result.assets[0]);
    }
  };

  const uploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);
    try {
      const mimeType = asset.mimeType || 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';
      const fileName = `${user?.id || 'church-user'}-${Date.now()}.${extension}`;

      const signedUrlRes = await axios.post(
        `${API_URL}/uploads/signed-url`,
        {
          files: [
            {
              name: fileName,
              type: mimeType,
              bucket: 'amc_image_bucket',
            },
          ],
        },
        { headers }
      );

      const signedUrl = signedUrlRes.data?.signedUrls?.[0]?.url;
      if (!signedUrl) {
        throw new Error('Signed URL generation failed');
      }

      const fileResponse = await fetch(asset.uri);
      const fileBlob = await fileResponse.blob();

      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: fileBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const publicUrl = `https://storage.googleapis.com/amc_image_bucket/${fileName}`;
      const profileData = {
        profile_picture_url: publicUrl,
        profile_picture_key: fileName,
        profile_picture_size: String(asset.fileSize || 0),
      };

      await axios.put(`${API_URL}/user/profile-picture`, profileData, { headers });
      await refreshUser();
    } catch (e: any) {
      console.error('Upload error:', e.response?.data || e.message);
      Alert.alert('Error', 'Failed to upload profile picture');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/user/name`, { name: newName.trim() }, { headers });
      await refreshUser();
      setEditingName(false);
    } catch (e) { Alert.alert('Error', 'Failed to update name'); }
    finally { setSaving(false); }
  };

  const handleRemovePhoto = async () => {
    Alert.alert('Remove Photo', 'Are you sure?', [
      { text: 'Cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await axios.delete(`${API_URL}/user/profile-picture`, { headers });
          await refreshUser();
        } catch (e) { Alert.alert('Error', 'Failed to remove photo'); }
      }},
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete Account', 'This action cannot be undone. Are you sure?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await axios.delete(`${API_URL}/user`, { headers });
          await logout();
          router.replace('/login');
        } catch (e) { Alert.alert('Error', 'Failed to delete account'); }
      }},
    ]);
  };

  const profilePic = user?.profile_picture_url;

  return (
    <View style={shapes.page}>
      <StackHeader title="Profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        // One tap on Save works even while the keyboard is still up.
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.photoSection}>
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={isUploading}
            accessibilityRole="button"
            accessibilityLabel={profilePic ? 'Change photo' : 'Add profile picture'}
          >
            <Avatar uri={profilePic} name={user?.name} size={AVATAR_SIZE} />
            {isUploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            )}
          </TouchableOpacity>

          {profilePic ? (
            <View style={styles.photoActions}>
              <TouchableOpacity
                onPress={handlePickImage}
                disabled={isUploading}
                style={styles.textAction}
                accessibilityRole="button"
              >
                <Text style={text.link}>Change photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRemovePhoto} style={styles.textAction} accessibilityRole="button">
                <Text style={[text.link, styles.removePhotoText]}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handlePickImage}
              disabled={isUploading}
              style={styles.textAction}
              accessibilityRole="button"
            >
              <Text style={text.link}>{isUploading ? 'Uploading...' : 'Add profile picture'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={shapes.group}>
          {editingName ? (
            <View style={styles.row}>
              <Text style={text.footnote}>Name</Text>
              <TextInput
                style={[shapes.inputOnCard, styles.nameInput]}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                accessibilityLabel="Name"
              />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.row, styles.rowWithIcon]}
              onPress={() => setEditingName(true)}
              accessibilityRole="button"
              accessibilityLabel={`Name, ${user?.name || ''}`}
              accessibilityHint="Edits your name"
            >
              <View style={styles.rowText}>
                <Text style={text.footnote}>Name</Text>
                <Text style={text.bodyLarge}>{user?.name}</Text>
              </View>
              <Ionicons name="pencil-outline" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          )}
          <View style={[shapes.divider, styles.rowDivider]} />
          <View style={styles.row}>
            <Text style={text.footnote}>Email</Text>
            <Text style={text.bodyLarge}>{user?.email}</Text>
          </View>
        </View>

        {editingName ? (
          <View style={styles.editActions}>
            <Button label="Save" onPress={handleSaveName} loading={saving} />
            <TouchableOpacity
              onPress={() => { setEditingName(false); setNewName(user?.name || ''); }}
              style={styles.textAction}
              accessibilityRole="button"
            >
              <Text style={text.link}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Button label="Delete Account" kind="danger" onPress={handleDeleteAccount} style={styles.deleteBtn} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: 12,
  },
  photoSection: { alignItems: 'center', marginBottom: 16 },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  textAction: { minHeight: TAP, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: colors.red },
  row: { minHeight: 64, paddingHorizontal: ROW_PADDING, paddingVertical: 10, justifyContent: 'center', gap: 2 },
  rowWithIcon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowDivider: { marginLeft: ROW_PADDING },
  nameInput: { marginTop: 4 },
  editActions: { marginTop: 16, gap: 4 },
  deleteBtn: { marginTop: 40 },
});
