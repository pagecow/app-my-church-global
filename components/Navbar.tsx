import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import axios from 'axios';
import { Avatar, CircleButton, IconName, Tile } from './ui';
import { colors, GUTTER, shapes, TAP, text } from '../lib/theme';

const API_URL = 'https://appmychurch.com/api/v1';

/**
 * The top of every tab.
 *
 * Home passes no `title` and gets the church's logo and name. Every other tab
 * passes its own title ("Events"). `onAdd` shows the round blue plus button,
 * which screens pass for admins only.
 */
export default function Navbar({
  title,
  onAdd,
  addLabel = 'Add',
}: {
  title?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const { user, appData, token, logout } = useAuth();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [copied, setCopied] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const nnSubId = user?.native_notify_indie_id;

  /**
   * The badge is fed by our own backend, not by a push receipt. A failed or
   * missing endpoint just leaves the bell unbadged - it never blocks the header.
   */
  const refreshUnread = useCallback(async () => {
    if (!token || !nnSubId) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await axios.get(
        `${API_URL}/notifications/unread-count?nnSubId=${encodeURIComponent(nnSubId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const count =
        typeof res.data === 'number' ? res.data : Number(res.data?.count ?? res.data?.unread ?? 0);
      setUnreadCount(Number.isFinite(count) && count > 0 ? count : 0);
    } catch {
      setUnreadCount(0);
    }
  }, [token, nnSubId]);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
    }, [refreshUnread])
  );

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

  const go = (path: '/profile' | '/about') => {
    setDrawerVisible(false);
    router.push(path);
  };

  const churchName = appData?.name || 'App My Church';

  return (
    <View style={[styles.navbar, { paddingTop: insets.top + 6 }]}>
      {title ? (
        <Text style={[text.largeTitle, styles.title]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <>
          <Tile uri={appData?.logo_url} name={churchName} size={38} fit="contain" />
          <Text
            style={[text.title, styles.churchName]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            accessibilityRole="header"
          >
            {churchName}
          </Text>
        </>
      )}

      {onAdd ? <CircleButton icon="add" kind="accent" size={32} onPress={onAdd} accessibilityLabel={addLabel} /> : null}

      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => router.push('/notifications')}
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} new` : 'Notifications'}
        accessibilityRole="button"
      >
        <Ionicons name="notifications-outline" size={25} color={colors.ink} />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => setDrawerVisible(true)}
        accessibilityLabel="Your profile and menu"
        accessibilityRole="button"
      >
        <Avatar uri={user?.profile_picture_url} name={user?.name} size={36} />
      </TouchableOpacity>

      <Modal visible={drawerVisible} animationType="slide" transparent onRequestClose={() => setDrawerVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDrawerVisible(false)}>
          <View
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.grabber} />

            <View style={styles.me}>
              <Avatar uri={user?.profile_picture_url} name={user?.name} size={52} />
              <View style={styles.meText}>
                <Text style={text.headline} numberOfLines={1}>
                  {user?.name || 'Your account'}
                </Text>
                <Text style={text.secondary} numberOfLines={1}>
                  {churchName}
                </Text>
              </View>
              <CircleButton icon="close" onPress={() => setDrawerVisible(false)} accessibilityLabel="Close menu" />
            </View>

            <View style={shapes.group}>
              <MenuRow icon="person-outline" label="Profile" onPress={() => go('/profile')} />
              <View style={[shapes.divider, styles.rowDivider]} />
              <MenuRow icon="business-outline" label="About Our Church" onPress={() => go('/about')} />
              <View style={[shapes.divider, styles.rowDivider]} />
              <MenuRow icon="share-outline" label="Share App" onPress={handleShare} />
            </View>

            {appData?.apple_app_store_link || appData?.google_app_store_link ? (
              <View style={[shapes.group, styles.groupGap]}>
                {appData?.apple_app_store_link ? (
                  <MenuRow
                    icon="logo-apple"
                    label={copied === 'apple' ? 'Copied!' : 'Copy Apple Link'}
                    trailing="copy-outline"
                    onPress={() => copyLink('apple')}
                  />
                ) : null}
                {appData?.apple_app_store_link && appData?.google_app_store_link ? (
                  <View style={[shapes.divider, styles.rowDivider]} />
                ) : null}
                {appData?.google_app_store_link ? (
                  <MenuRow
                    icon="logo-google-playstore"
                    label={copied === 'google' ? 'Copied!' : 'Copy Google Link'}
                    trailing="copy-outline"
                    onPress={() => copyLink('google')}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={[shapes.group, styles.groupGap]}>
              <MenuRow icon="log-out-outline" label="Log Out" danger onPress={handleLogout} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  trailing = 'chevron-forward',
  danger = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  trailing?: IconName;
  danger?: boolean;
}) {
  const color = danger ? colors.red : colors.ink;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={danger ? colors.red : colors.inkSoft} />
      <Text style={[styles.rowText, { color }]} numberOfLines={1}>
        {label}
      </Text>
      {danger ? null : <Ionicons name={trailing} size={18} color={colors.inkFaint} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: GUTTER,
    paddingRight: 8,
    paddingBottom: 6,
    backgroundColor: colors.page,
    gap: 2,
  },
  title: { flex: 1 },
  churchName: { flex: 1, marginLeft: 8 },
  iconBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.page,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.page,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: GUTTER,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.grabber,
    marginBottom: 10,
  },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  meText: { flex: 1, gap: 2 },
  groupGap: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingHorizontal: 16 },
  rowText: { flex: 1, fontSize: 17 },
  rowDivider: { marginLeft: 52 },
});
