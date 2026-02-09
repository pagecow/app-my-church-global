import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Modal, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

export default function Navbar() {
  const { user, appData, logout } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [copied, setCopied] = useState('');
  const router = useRouter();

  const handleLogout = async () => {
    setDrawerVisible(false);
    await logout();
    router.replace('/find-church');
  };

  const copyLink = async (type: 'apple' | 'google') => {
    const link = type === 'apple' ? appData?.apple_app_store_link : appData?.google_app_store_link;
    if (link) {
      await Clipboard.setStringAsync(link);
      setCopied(type);
      setTimeout(() => setCopied(''), 2000);
    }
  };

  const handleShare = () => {
    setDrawerVisible(false);
    router.push('/share');
  };

  const profilePic = user?.profile_picture_url;

  return (
    <View style={styles.navbar}>
      <Text style={styles.churchName} numberOfLines={1}>{appData?.name || 'App My Church'}</Text>
      <TouchableOpacity onPress={() => setDrawerVisible(true)}>
        {profilePic ? (
          <Image source={{ uri: profilePic }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <MaterialIcons name="person" size={22} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={drawerVisible} animationType="slide" transparent>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDrawerVisible(false)}>
          <View style={styles.drawer} onStartShouldSetResponder={() => true}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Menu</Text>
              <TouchableOpacity onPress={() => setDrawerVisible(false)}>
                <MaterialIcons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/profile'); }}>
              <MaterialIcons name="person" size={24} color="#333" />
              <Text style={styles.drawerText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/about'); }}>
              <MaterialIcons name="church" size={24} color="#333" />
              <Text style={styles.drawerText}>About Our Church</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.drawerItem} onPress={handleShare}>
              <MaterialIcons name="share" size={24} color="#333" />
              <Text style={styles.drawerText}>Share App</Text>
            </TouchableOpacity>

            <View style={styles.shareLinks}>
              <TouchableOpacity style={styles.copyBtn} onPress={() => copyLink('apple')}>
                <MaterialIcons name="phone-iphone" size={20} color="#333" />
                <Text style={styles.copyText}>{copied === 'apple' ? 'Copied!' : 'Copy Apple Link'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.copyBtn} onPress={() => copyLink('google')}>
                <MaterialIcons name="phone-android" size={20} color="#333" />
                <Text style={styles.copyText}>{copied === 'google' ? 'Copied!' : 'Copy Google Link'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.drawerItem, styles.logoutItem]} onPress={handleLogout}>
              <MaterialIcons name="logout" size={24} color="#ef4444" />
              <Text style={[styles.drawerText, { color: '#ef4444' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 55, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  churchName: { fontSize: 18, fontWeight: 'bold', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  drawerTitle: { fontSize: 20, fontWeight: 'bold' },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  drawerText: { fontSize: 16, marginLeft: 12 },
  logoutItem: { borderBottomWidth: 0, marginTop: 10 },
  shareLinks: { paddingLeft: 36, paddingVertical: 8 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  copyText: { marginLeft: 8, color: '#666', fontSize: 14 },
});
