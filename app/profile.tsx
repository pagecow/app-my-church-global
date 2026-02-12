import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const API_URL = 'https://appmychurch.com/api/v1';

export default function ProfileScreen() {
  const { user, token, refreshUser, logout } = useAuth();
  const router = useRouter();
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileSection}>
        <TouchableOpacity onPress={handlePickImage} disabled={isUploading}>
          {profilePic ? (
            <Image source={{ uri: profilePic }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profileImage, styles.profileFallback]}>
              {isUploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <MaterialIcons name="person" size={60} color="#fff" />
              )}
            </View>
          )}
          {isUploading && (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        {profilePic ? (
          <View style={styles.photoActions}>
            <TouchableOpacity onPress={handlePickImage} disabled={isUploading}>
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRemovePhoto} style={styles.removeBtn}>
              <Text style={styles.removePhotoText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handlePickImage} disabled={isUploading}>
            <Text style={styles.addPhotoText}>{isUploading ? 'Uploading...' : 'Add profile picture'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.nameSection}>
        {editingName ? (
          <View style={styles.editNameRow}>
            <TextInput style={styles.nameInput} value={newName} onChangeText={setNewName} autoFocus />
            <TouchableOpacity onPress={handleSaveName} disabled={saving}>
              <Text style={styles.saveBtn}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingName(false); setNewName(user?.name || ''); }}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.nameRow} onPress={() => setEditingName(true)}>
            <Text style={styles.nameText}>{user?.name}</Text>
            <MaterialIcons name="edit" size={20} color="#666" />
          </TouchableOpacity>
        )}
        <Text style={styles.emailText}>{user?.email}</Text>
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
        <Text style={styles.deleteBtnText}>Delete Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 55, paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, marginLeft: 4 },
  profileSection: { alignItems: 'center', paddingVertical: 30 },
  profileImage: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  profileFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoActions: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  changePhotoText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  removeBtn: { paddingVertical: 8 },
  removePhotoText: { color: '#ef4444', fontSize: 15 },
  addPhotoText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  nameSection: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { fontSize: 20, fontWeight: 'bold' },
  emailText: { fontSize: 15, color: '#666', marginTop: 4 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16 },
  saveBtn: { color: '#007AFF', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { color: '#666', fontSize: 15 },
  deleteBtn: { marginTop: 40, marginHorizontal: 20, backgroundColor: '#ef4444', padding: 16, borderRadius: 8, alignItems: 'center' },
  deleteBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
