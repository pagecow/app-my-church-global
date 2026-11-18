import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Navbar from '../../components/Navbar';
import EventDetailSheet from '../../components/EventDetailSheet';
import EventFormSheet from '../../components/EventFormSheet';
import { Chip, EmptyState, Loading, SectionTitle, SegmentedControl } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { colors, GUTTER, shapes, TAP, text } from '../../lib/theme';
import {
  buildMonth,
  buildUpcoming,
  dayKey,
  EventItem,
  EventRow,
  EventRsvp,
  formatDayLong,
  formatStartTime,
  isRepeating,
  monthGrid,
  MONTHS,
  MONTHS_SHORT,
  myRsvp,
  repeatLabelShort,
  rowMeta,
  rsvpLabel,
  RSVPResponse,
  sameDay,
  startOfDay,
} from '../../lib/events';

const API_URL = 'https://appmychurch.com/api/v1';
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type ViewMode = 'upcoming' | 'calendar';

export default function EventsScreen() {
  const { token, user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('upcoming');
  const [rsvpLoadingByEvent, setRsvpLoadingByEvent] = useState<Record<string, boolean>>({});

  // The day is read once per visit to the screen; a list that re-sorted itself
  // at midnight under someone's finger would be worse than one that is a day old.
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [month, setMonth] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [selectedDay, setSelectedDay] = useState<Date>(today);

  const [detail, setDetail] = useState<{ id: string; day: Date | null } | null>(null);
  const [form, setForm] = useState<{ visible: boolean; event: EventItem | null; day: Date | null }>({
    visible: false,
    event: null,
    day: null,
  });

  const fetchEvents = useCallback(async () => {
    try {
      const appId = await AsyncStorage.getItem('appId');
      if (!appId || !token) {
        setEvents([]);
        return;
      }
      // The server lists events newest-made first and knows nothing of
      // "upcoming", so the app asks for all of them and sorts by date itself.
      const res = await axios.get(`${API_URL}/events?appId=${appId}&page=1&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents(Array.isArray(res.data) ? res.data : []);
      setToday(startOfDay(new Date()));
    } catch (error) {
      console.error('Fetch events error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchEvents();
    }
  }, [token, fetchEvents]);

  const deleteEvent = async (eventId: string) => {
    if (!token) return;
    try {
      await axios.delete(`${API_URL}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDetail(null);
      fetchEvents();
    } catch (error: any) {
      Alert.alert('Delete Event', error?.response?.data?.message || 'Unable to delete event.');
    }
  };

  const openEventOptions = (event: EventItem) => {
    Alert.alert('Event options', 'Choose an action', [
      {
        text: 'Edit Event',
        onPress: () => {
          // One sheet has to finish closing before the next can open.
          setDetail(null);
          setTimeout(() => setForm({ visible: true, event, day: null }), 450);
        },
      },
      {
        text: 'Delete Event',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(event.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitRsvp = async (eventId: string, response: RSVPResponse) => {
    if (!token || !user?.id) return;
    setRsvpLoadingByEvent((prev) => ({ ...prev, [eventId]: true }));
    try {
      const res = await axios.post(
        `${API_URL}/events/${eventId}/rsvp`,
        { response },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updatedRsvp: EventRsvp | undefined = res.data?.rsvp;
      if (!updatedRsvp) return;

      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) return event;
          const current = [...(event.rsvps || [])];
          const idx = current.findIndex((item) => item.church_userId === user.id);
          if (idx >= 0) {
            current[idx] = { ...current[idx], ...updatedRsvp };
          } else {
            current.push(updatedRsvp);
          }
          return { ...event, rsvps: current };
        })
      );
    } catch (error: any) {
      Alert.alert('RSVP', error?.response?.data?.message || 'Unable to save RSVP.');
    } finally {
      setRsvpLoadingByEvent((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  const upcoming = useMemo(() => buildUpcoming(events, today), [events, today]);
  const monthEvents = useMemo(() => buildMonth(events, month.year, month.month), [events, month]);
  const cells = useMemo(() => monthGrid(month.year, month.month), [month]);
  const selectedEvents = monthEvents[dayKey(selectedDay)] || [];
  const detailEvent = detail ? events.find((event) => event.id === detail.id) || null : null;

  const shiftMonth = (by: number) => {
    const next = new Date(month.year, month.month + by, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() });
    // Land on today when its month comes into view, otherwise on the 1st.
    const showsToday = next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth();
    setSelectedDay(showsToday ? today : next);
  };

  const goToToday = () => {
    setMonth({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDay(today);
  };

  const openAdd = () =>
    setForm({ visible: true, event: null, day: view === 'calendar' ? selectedDay : null });

  const renderRow = (row: EventRow, index: number) => (
    <React.Fragment key={`${row.event.id}-${row.day ? dayKey(row.day) : 'none'}`}>
      {index > 0 ? <View style={[shapes.divider, styles.rowDivider]} /> : null}
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => setDetail({ id: row.event.id, day: row.day })}
        accessibilityRole="button"
        accessibilityLabel={`${row.event.title}. ${rowMeta(row.event, row.day, today)}`}
      >
        <DateTile day={row.day} isToday={!!row.day && sameDay(row.day, today)} />
        <View style={styles.rowText}>
          <Text style={text.headline} numberOfLines={1}>
            {row.event.title}
          </Text>
          <Text style={text.secondary} numberOfLines={1}>
            {rowMeta(row.event, row.day, today) || 'No date yet'}
          </Text>
        </View>
        <RowTrailing event={row.event} userId={user?.id} />
      </TouchableOpacity>
    </React.Fragment>
  );

  const renderSection = (title: string, rows: EventRow[]) =>
    rows.length === 0 ? null : (
      <View key={title}>
        <SectionTitle>{title}</SectionTitle>
        <View style={shapes.group}>{rows.map(renderRow)}</View>
      </View>
    );

  const nothingUpcoming =
    upcoming.today.length + upcoming.week.length + upcoming.later.length + upcoming.undated.length === 0;

  return (
    <View style={shapes.page}>
      <Navbar title="Events" onAdd={isAdmin ? openAdd : undefined} addLabel="Add event" />

      <SegmentedControl<ViewMode>
        style={styles.switcher}
        value={view}
        onChange={setView}
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'calendar', label: 'Calendar' },
        ]}
      />

      {loading && !refreshing ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.inkMuted}
              onRefresh={() => {
                setRefreshing(true);
                fetchEvents();
              }}
            />
          }
        >
          {view === 'upcoming' ? (
            events.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                title="No events yet"
                hint={isAdmin ? 'Tap the plus button to add the first one.' : 'Check back soon.'}
              />
            ) : nothingUpcoming ? (
              <EmptyState
                icon="calendar-outline"
                title="Nothing coming up"
                hint="Earlier events are in the Calendar."
              />
            ) : (
              <>
                {renderSection('Today', upcoming.today)}
                {renderSection('This week', upcoming.week)}
                {renderSection('Later', upcoming.later)}
                {renderSection('No date yet', upcoming.undated)}
              </>
            )
          ) : (
            <>
              <View style={[shapes.card, styles.calendar]}>
                <View style={styles.monthBar}>
                  <TouchableOpacity
                    style={styles.monthTitleBtn}
                    onPress={goToToday}
                    accessibilityRole="button"
                    accessibilityLabel={`${MONTHS[month.month]} ${month.year}. Go to today`}
                  >
                    <Text style={text.section}>
                      {MONTHS[month.month]} {month.year}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.monthArrow}
                    onPress={() => shiftMonth(-1)}
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.azure} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.monthArrow}
                    onPress={() => shiftMonth(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.azure} />
                  </TouchableOpacity>
                </View>

                <View style={styles.weekRow}>
                  {WEEKDAY_LETTERS.map((letter, index) => (
                    <Text key={`${letter}-${index}`} style={styles.weekLetter}>
                      {letter}
                    </Text>
                  ))}
                </View>

                <View style={styles.grid}>
                  {cells.map((cell, index) => {
                    if (!cell) return <View key={`blank-${index}`} style={styles.cell} />;
                    const count = (monthEvents[dayKey(cell)] || []).length;
                    const isToday = sameDay(cell, today);
                    const isSelected = sameDay(cell, selectedDay);
                    return (
                      <Pressable
                        key={dayKey(cell)}
                        style={styles.cell}
                        onPress={() => setSelectedDay(cell)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${formatDayLong(cell, today)}, ${
                          count === 0 ? 'no events' : count === 1 ? '1 event' : `${count} events`
                        }`}
                      >
                        <View
                          style={[
                            styles.dayCircle,
                            isSelected && !isToday ? styles.daySelected : null,
                            isToday ? styles.dayToday : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayNumber,
                              isSelected && !isToday ? styles.dayNumberSelected : null,
                              isToday ? styles.dayNumberToday : null,
                            ]}
                          >
                            {cell.getDate()}
                          </Text>
                        </View>
                        <View style={styles.dots}>
                          {count > 0 ? <View style={styles.dot} /> : null}
                          {count > 1 ? <View style={styles.dot} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text style={[text.headline, styles.dayTitle]} accessibilityRole="header">
                {sameDay(selectedDay, today) ? 'Today, ' : ''}
                {formatDayLong(selectedDay, today)}
              </Text>

              {selectedEvents.length === 0 ? (
                <View style={[shapes.group, styles.nothing]}>
                  <Text style={styles.nothingText}>Nothing planned for this day.</Text>
                </View>
              ) : (
                <View style={shapes.group}>
                  {selectedEvents.map((event, index) => (
                    <React.Fragment key={event.id}>
                      {index > 0 ? <View style={[shapes.divider, styles.dayRowDivider]} /> : null}
                      <TouchableOpacity
                        style={styles.dayRow}
                        activeOpacity={0.7}
                        onPress={() => setDetail({ id: event.id, day: selectedDay })}
                        accessibilityRole="button"
                        accessibilityLabel={`${event.title}. ${formatStartTime(event) || 'All day'}`}
                      >
                        <Text style={styles.dayRowTime}>{formatStartTime(event) || 'All day'}</Text>
                        <View style={styles.rowText}>
                          <Text style={text.headline} numberOfLines={1}>
                            {event.title}
                          </Text>
                          {dayRowMeta(event) ? (
                            <Text style={text.secondary} numberOfLines={1}>
                              {dayRowMeta(event)}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <EventDetailSheet
        event={detailEvent}
        day={detail?.day || null}
        userId={user?.id}
        isAdmin={isAdmin}
        rsvpLoading={!!(detailEvent && rsvpLoadingByEvent[detailEvent.id])}
        onRsvp={submitRsvp}
        onOptions={openEventOptions}
        onClose={() => setDetail(null)}
      />

      <EventFormSheet
        visible={form.visible}
        event={form.event}
        defaultDay={form.day}
        token={token}
        userId={user?.id}
        onClose={() => setForm((prev) => ({ ...prev, visible: false }))}
        onSaved={() => {
          setForm((prev) => ({ ...prev, visible: false }));
          fetchEvents();
        }}
      />
    </View>
  );
}

/** "Room 204 · Weekly" under an event in the calendar's day list. */
function dayRowMeta(event: EventItem): string {
  return [event.location, repeatLabelShort(event)].filter(Boolean).join(' · ');
}

/** The month and day in a small rounded square. Today's is filled blue. */
function DateTile({ day, isToday }: { day: Date | null; isToday: boolean }) {
  if (!day) {
    return (
      <View style={styles.tile}>
        <Ionicons name="help" size={20} color={colors.inkMuted} />
      </View>
    );
  }
  return (
    <View style={[styles.tile, isToday ? styles.tileToday : null]}>
      <Text style={[styles.tileMonth, isToday ? styles.tileOnToday : null]}>
        {MONTHS_SHORT[day.getMonth()].toUpperCase()}
      </Text>
      <Text style={[styles.tileDay, isToday ? styles.tileOnToday : null]}>{day.getDate()}</Text>
    </View>
  );
}

/** The right-hand side of a row: how often it repeats, or this person's answer. */
function RowTrailing({ event, userId }: { event: EventItem; userId?: string | null }) {
  if (isRepeating(event)) {
    return (
      <View style={styles.repeat}>
        <Ionicons name="repeat" size={14} color={colors.inkMuted} />
        <Text style={styles.repeatText}>{repeatLabelShort(event)}</Text>
      </View>
    );
  }
  const mine = myRsvp(event, userId);
  if (mine === 'YES') return <Chip label={rsvpLabel(mine)} kind="success" icon="checkmark" />;
  if (mine) return <Chip label={rsvpLabel(mine)} />;
  return <Chip label="RSVP" kind="accent" />;
}

const styles = StyleSheet.create({
  switcher: { marginHorizontal: GUTTER, marginTop: 4 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 32 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 68 },
  rowDivider: { marginLeft: 70 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  tile: {
    width: 46,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileToday: { backgroundColor: colors.azure },
  tileMonth: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: colors.azureText },
  tileDay: { fontSize: 20, lineHeight: 23, fontWeight: '700', color: colors.ink },
  tileOnToday: { color: colors.white },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repeatText: { fontSize: 12, fontWeight: '500', color: colors.inkMuted },

  calendar: { marginTop: 14, paddingTop: 4, paddingBottom: 10, paddingHorizontal: 8 },
  monthBar: { flexDirection: 'row', alignItems: 'center' },
  monthTitleBtn: { flex: 1, minHeight: TAP, justifyContent: 'center', paddingLeft: 10 },
  monthArrow: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', paddingTop: 2, paddingBottom: 4 },
  weekLetter: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.inkMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 50, alignItems: 'center', gap: 3 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.azureTint },
  dayToday: { backgroundColor: colors.azure },
  dayNumber: { fontSize: 17, color: colors.ink },
  dayNumberSelected: { fontWeight: '700', color: colors.azureTintText },
  dayNumberToday: { fontWeight: '700', color: colors.white },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.azure },

  dayTitle: { marginTop: 18, marginBottom: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, minHeight: 60 },
  dayRowDivider: { marginLeft: 14 },
  dayRowTime: { width: 72, fontSize: 14, fontWeight: '600', color: colors.azureText },
  nothing: { paddingVertical: 20, paddingHorizontal: 16 },
  nothingText: { ...text.secondary, fontSize: 15, textAlign: 'center' },
});
