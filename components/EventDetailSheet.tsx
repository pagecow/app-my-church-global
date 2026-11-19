import React from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, CircleButton, IconName } from './ui';
import { themedStyles, useAccent } from '../lib/churchColor';
import { colors, GUTTER, radius, text } from '../lib/theme';
import {
  countRsvps,
  EventItem,
  eventEndDay,
  eventStartDay,
  formatDayLong,
  formatTimeRange,
  isMultiDay,
  isRepeating,
  myRsvp,
  repeatLabelLong,
  RSVP_CHOICES,
  RSVPResponse,
} from '../lib/events';

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

/**
 * One event, opened from the list or the calendar: its photo, when and where,
 * the description, and the RSVP buttons.
 *
 * A repeating event has no RSVP: an answer is stored once per event, not once
 * per date, so "Going" to a weekly service would never reset.
 */
export default function EventDetailSheet({
  event,
  day,
  userId,
  isAdmin,
  rsvpLoading,
  onRsvp,
  onOptions,
  onClose,
}: {
  /** Null closes the sheet. */
  event: EventItem | null;
  /** The day the person tapped: a repeating event's next date, or a calendar day. */
  day: Date | null;
  userId?: string | null;
  isAdmin: boolean;
  rsvpLoading: boolean;
  onRsvp: (eventId: string, response: RSVPResponse) => void;
  onOptions: (event: EventItem) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // A page sheet on iPhone already starts below the status bar.
  const topInset = Platform.OS === 'ios' ? 0 : insets.top;

  return (
    <Modal visible={!!event} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {event ? (
        <View style={styles.root}>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
            {event.mediaUrl ? (
              <Image source={{ uri: event.mediaUrl }} style={styles.photo} />
            ) : (
              <View style={{ height: topInset + 56 }} />
            )}

            <View style={styles.body}>
              <Text style={styles.title} accessibilityRole="header">
                {event.title}
              </Text>

              <View style={styles.facts}>
                <Fact icon="calendar-outline" primary={whenLine(event, day)} secondary={formatTimeRange(event)} />
                {isRepeating(event) ? <Fact icon="repeat" primary={repeatLabelLong(event) || 'Repeats'} /> : null}
                {event.location ? <Fact icon="location-outline" primary={event.location} /> : null}
              </View>

              {event.description ? (
                <Text style={styles.description}>
                  {event.description.split(URL_REGEX).map((part, idx) => {
                    const isUrl = /^https?:\/\//i.test(part);
                    if (!isUrl) return <Text key={`txt-${idx}`}>{part}</Text>;
                    return (
                      <Text
                        key={`url-${idx}`}
                        style={styles.link}
                        onPress={() => Linking.openURL(part)}
                        accessibilityRole="link"
                      >
                        {part}
                      </Text>
                    );
                  })}
                </Text>
              ) : null}

              {isRepeating(event) ? null : (
                <Rsvp event={event} userId={userId} loading={rsvpLoading} onRsvp={onRsvp} />
              )}
            </View>
          </ScrollView>

          {/* Over the photo, so they stay put while the page scrolls. */}
          <View style={[styles.controls, { top: topInset + 6 }]} pointerEvents="box-none">
            <CircleButton icon="close" kind="floating" onPress={onClose} accessibilityLabel="Close" />
            {isAdmin ? (
              <CircleButton
                icon="ellipsis-horizontal"
                kind="floating"
                onPress={() => onOptions(event)}
                accessibilityLabel="Edit or delete event"
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

/** "Sunday, November 22", "June 9 to June 14", or nothing certain to say. */
function whenLine(event: EventItem, day: Date | null): string {
  const start = eventStartDay(event);
  if (isMultiDay(event) && start) {
    return `${formatDayLong(start)} to ${formatDayLong(eventEndDay(event)!)}`;
  }
  const shown = isRepeating(event) ? day : start || day;
  return shown ? formatDayLong(shown) : 'Date to be announced';
}

function Fact({ icon, primary, secondary }: { icon: IconName; primary: string; secondary?: string | null }) {
  const accent = useAccent();
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>
        <Ionicons name={icon} size={20} color={accent.azureText} />
      </View>
      <View style={styles.factText}>
        <Text style={styles.factPrimary}>{primary}</Text>
        {secondary ? <Text style={text.secondary}>{secondary}</Text> : null}
      </View>
    </View>
  );
}

function Rsvp({
  event,
  userId,
  loading,
  onRsvp,
}: {
  event: EventItem;
  userId?: string | null;
  loading: boolean;
  onRsvp: (eventId: string, response: RSVPResponse) => void;
}) {
  const styles = useStyles();
  const mine = myRsvp(event, userId);
  const counts = countRsvps(event.rsvps);
  const going = (event.rsvps || []).filter((r) => r.response === 'YES');
  const summary = [
    counts.YES > 0 ? `${counts.YES} going` : null,
    counts.MAYBE > 0 ? `${counts.MAYBE} maybe` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.rsvp}>
      <View style={styles.rsvpHead}>
        <Text style={text.headline}>Are you coming?</Text>
        {loading ? <ActivityIndicator size="small" color={colors.inkMuted} /> : null}
      </View>
      <View style={styles.rsvpChoices}>
        {RSVP_CHOICES.map((choice) => {
          const on = mine === choice.value;
          return (
            <TouchableOpacity
              key={choice.value}
              style={[styles.rsvpChoice, on ? styles.rsvpChoiceOn : null]}
              onPress={() => onRsvp(event.id, choice.value)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: loading }}
              accessibilityLabel={choice.label}
            >
              <Text style={[styles.rsvpChoiceText, on ? styles.rsvpChoiceTextOn : null]} numberOfLines={1}>
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {summary ? (
        <View style={styles.rsvpSummary}>
          <View style={styles.rsvpFaces}>
            {going.slice(0, 4).map((r, index) => (
              <Avatar
                key={r.id}
                uri={r.church_user?.profile_picture_url}
                name={r.church_user?.name}
                size={28}
                style={[styles.rsvpFace, index > 0 ? styles.rsvpFaceOverlap : null]}
              />
            ))}
          </View>
          <Text style={text.secondary}>{summary}</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((accent) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  photo: { width: '100%', height: 250, backgroundColor: colors.fill },
  controls: {
    position: 'absolute',
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 18 },
  title: { fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5, color: colors.ink },
  facts: { gap: 14 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: { flex: 1, gap: 1 },
  factPrimary: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.ink },
  description: { fontSize: 16, lineHeight: 24, color: colors.inkSoft },
  link: { color: accent.azureText, textDecorationLine: 'underline' },

  rsvp: { backgroundColor: colors.page, borderRadius: radius.xl, padding: GUTTER, gap: 12 },
  rsvpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rsvpChoices: { flexDirection: 'row', gap: 8 },
  rsvpChoice: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rsvpChoiceOn: { backgroundColor: accent.azure },
  rsvpChoiceText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rsvpChoiceTextOn: { color: colors.white },
  rsvpSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rsvpFaces: { flexDirection: 'row' },
  rsvpFace: { borderWidth: 2, borderColor: colors.page },
  rsvpFaceOverlap: { marginLeft: -9 },
}));
