import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navbar from '../../components/Navbar';

const API_URL = 'https://appmychurch.com/api/v1';

const formatTimeAgo = (dateString: string) => {
  const now = new Date();
  const [datePart, timePart] = dateString.split(' ');
  if (!datePart || !timePart) return '';
  const [m, d, y] = datePart.split('-').map(Number);
  const ampm = timePart.slice(-2).toUpperCase();
  const [hStr, mStr] = timePart.slice(0, -2).split(':');
  let h = parseInt(hStr);
  const min = parseInt(mStr);
  if (ampm === 'PM' && h < 12) h += 12;
  else if (ampm === 'AM' && h === 12) h = 0;
  const date = new Date(Date.UTC(y, m - 1, d, h, min));
  const diffMs = now.getTime() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d`;
  return `${Math.floor(diffD / 30)}mo`;
};

export default function NotificationsScreen() {
  const { token, user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (token) fetchNotifications(); }, [token]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const appId = await AsyncStorage.getItem('appId');
      const nnId = user?.native_notify_indie_id;
      if (!appId || !nnId) { setLoading(false); return; }
      const res = await axios.get(`${API_URL}/notifications?appId=${appId}&nnSubId=${nnId}&take=20&skip=0`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  if (loading && !refreshing) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  return (
    <View style={styles.container}>
      <Navbar />
      <FlatList
        data={notifications}
        keyExtractor={(_, i) => i.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} />}
        renderItem={({ item }) => (
          <View style={styles.notifItem}>
            <View style={styles.notifDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>{item.title || 'Notification'}</Text>
              <Text style={styles.notifMessage}>{item.message || ''}</Text>
              {item.date && <Text style={styles.notifTime}>{formatTimeAgo(item.date)}</Text>}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notifItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', alignItems: 'flex-start' },
  notifDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3b82f6', marginTop: 5, marginRight: 12 },
  notifTitle: { fontWeight: '600', fontSize: 15 },
  notifMessage: { fontSize: 14, color: '#444', marginTop: 2 },
  notifTime: { fontSize: 12, color: '#999', marginTop: 4 },
  empty: { textAlign: 'center', padding: 40, color: '#999' },
});
