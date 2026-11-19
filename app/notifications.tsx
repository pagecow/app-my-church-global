import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { EmptyState, Loading, StackHeader } from '../components/ui';
import { colors, GUTTER, radius, shapes, text } from '../lib/theme';
import { notificationTarget, parsePushData } from '../lib/notifications';

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

/**
 * Opened by the bell at the top of every tab.
 *
 * This is an ordinary screen over the tabs, like Profile. It used to be a hidden
 * tab (`href: null`); since Expo SDK 56 a hidden tab can no longer be opened (the
 * router sends the person back to the first tab), which is what broke the bell.
 */
export default function NotificationsScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (token && user?.native_notify_indie_id) fetchNotifications();
  }, [token, user?.native_notify_indie_id]);

  /** Opens the post or the group a row is about. Where a row leads is decided in lib/notifications.ts. */
  const openNotificationTarget = (item: any) => {
    const target = notificationTarget(item?.pushData);
    if (target) router.push(target);
  };

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

  return (
    <View style={shapes.page}>
      <StackHeader title="Notifications" onBack={() => router.back()} />
      {loading && !refreshing ? (
        <Loading />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              tintColor={colors.inkMuted}
            />
          }
          ItemSeparatorComponent={RowDivider}
          renderItem={({ item, index }) => {
            const pushData = parsePushData(item.pushData);
            const preview = stripHtml(pushData.reply || pushData.comment || item.message || '');
            // A row opens a post, or the group it is about. Anything else is only a message.
            const canOpen = notificationTarget(item.pushData) !== null;
            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  index === 0 ? styles.rowFirst : null,
                  index === notifications.length - 1 ? styles.rowLast : null,
                ]}
                onPress={() => openNotificationTarget(item)}
                disabled={!canOpen}
                activeOpacity={0.75}
                accessibilityRole={canOpen ? 'button' : undefined}
              >
                <View style={styles.dot} />
                <View style={styles.rowText}>
                  <View style={styles.rowTop}>
                    <Text style={[text.headline, styles.rowTitle]}>{item.title || 'Notification'}</Text>
                    {item.date ? <Text style={text.footnote}>{formatTimeAgo(item.date)}</Text> : null}
                  </View>
                  {preview ? <Text style={styles.rowMessage}>{preview}</Text> : null}
                </View>
                {canOpen ? (
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} style={styles.chevron} />
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No notifications yet"
              hint="When there is something new for you, it will show up here."
            />
          }
        />
      )}
    </View>
  );
}

/** The line between two rows. It sits on white so the block of rows stays one piece. */
function RowDivider() {
  return (
    <View style={styles.dividerWrap}>
      <View style={[shapes.divider, styles.dividerLine]} />
    </View>
  );
}

const DOT = 10;
const ROW_GAP = 12;

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ROW_GAP,
    minHeight: 60,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    backgroundColor: colors.card,
  },
  rowFirst: { borderTopLeftRadius: radius.group, borderTopRightRadius: radius.group },
  rowLast: { borderBottomLeftRadius: radius.group, borderBottomRightRadius: radius.group },
  /* Lined up with the middle of the title's first line. */
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.azure, marginTop: 6 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowTitle: { flex: 1 },
  rowMessage: { ...text.secondary, fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  chevron: { marginTop: 2 },
  dividerWrap: { backgroundColor: colors.card },
  dividerLine: { marginLeft: 16 + DOT + ROW_GAP },
});
