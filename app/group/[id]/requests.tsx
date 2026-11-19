import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { Avatar, CircleButton, EmptyState, Loading, StackHeader } from '../../../components/ui';
import {
  GroupJoinRequest,
  describeMemberDetails,
  groupsApi,
  groupsErrorMessage,
} from '../../../lib/groups';
import { useAccent } from '../../../lib/churchColor';
import { colors, GUTTER, radius, shapes, TAP, text } from '../../../lib/theme';

const RowSeparator = () => (
  <View style={styles.separator}>
    <View style={[shapes.divider, styles.rowDivider]} />
  </View>
);

export default function GroupRequestsScreen() {
  const accent = useAccent();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === 'string' ? params.id : '';

  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const rows = await groupsApi.listJoinRequests(token, groupId);
      setRequests(rows);
    } catch (e: any) {
      Alert.alert('Error', groupsErrorMessage(e, 'Could not load requests.'));
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const decide = async (request: GroupJoinRequest, approve: boolean) => {
    if (!token) return;
    setBusyId(request.id);
    try {
      if (approve) {
        await groupsApi.approveJoinRequest(token, groupId, request.id);
      } else {
        await groupsApi.denyJoinRequest(token, groupId, request.id);
      }
      // A denied user can re-request later (the server flips status back to
      // pending), so removing the row is safe - it is not a permanent ban.
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (e: any) {
      Alert.alert('Could not update request', groupsErrorMessage(e, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <View style={shapes.page}>
      <StackHeader title="Requests" onBack={() => router.back()} />

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={RowSeparator}
        renderItem={({ item, index }) => {
          const busy = busyId === item.id;
          return (
            <View
              style={[
                styles.row,
                index === 0 ? styles.rowFirst : null,
                index === requests.length - 1 ? styles.rowLast : null,
              ]}
            >
              <Avatar uri={item.profile_picture_url} name={item.name} size={40} />
              <View style={styles.rowText}>
                <Text style={text.headline}>{item.name}</Text>
                {describeMemberDetails(item.birth_date, item.gender) ? (
                  <Text style={styles.details}>
                    {describeMemberDetails(item.birth_date, item.gender)}
                  </Text>
                ) : null}
                {item.message ? (
                  <Text style={text.secondary} numberOfLines={2}>
                    {item.message}
                  </Text>
                ) : (
                  <Text style={text.secondary}>wants to join this group</Text>
                )}
              </View>
              <View style={styles.actions}>
                {busy ? (
                  <ActivityIndicator size="small" color={accent.azure} />
                ) : (
                  <>
                    <CircleButton
                      icon="checkmark"
                      kind="accent"
                      onPress={() => decide(item, true)}
                      accessibilityLabel={`Approve ${item.name}`}
                    />
                    <CircleButton
                      icon="close"
                      onPress={() => decide(item, false)}
                      accessibilityLabel={`Deny ${item.name}`}
                    />
                  </>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="person-add-outline" title="No pending requests." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 8, paddingBottom: 32 },

  /* The requests are one white block: the list draws it row by row, so the first
     and the last row carry the rounded corners. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    marginHorizontal: GUTTER,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 6,
    backgroundColor: colors.card,
  },
  rowFirst: { borderTopLeftRadius: radius.group, borderTopRightRadius: radius.group },
  rowLast: { borderBottomLeftRadius: radius.group, borderBottomRightRadius: radius.group },
  separator: { marginHorizontal: GUTTER, backgroundColor: colors.card },
  /* Clears the row's picture: 12 (row padding) + 40 (picture) + 12 (gap). */
  rowDivider: { marginLeft: 64 },

  rowText: { flex: 1, minWidth: 0, gap: 1 },
  details: { ...text.footnote, fontWeight: '600', color: colors.inkSoft },
  /* Two round buttons side by side; the spinner that replaces them keeps the same room. */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: TAP * 2,
    minHeight: TAP,
  },
});
