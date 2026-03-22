import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../context/AuthContext';

const API_URL = 'https://appmychurch.com/api/v1';
const DEFAULT_EVENT_THUMBNAIL = 'https://appmychurch.com/appuser/content.jpg';
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

type EventItem = {
  id: string;
  title: string;
  description?: string | null;
  mediaUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  createdAt: string;
  rsvps?: EventRsvp[];
};

type RSVPResponse = 'YES' | 'NO' | 'MAYBE';
type EventRsvp = {
  id: string;
  church_userId: string;
  eventId: string;
  response: RSVPResponse;
  church_user?: {
    id: string;
    name: string | null;
    profile_picture_url: string | null;
  };
};

export default function EventsScreen() {
  const { token, user } = useAuth();
  const now = new Date();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const [startDateValue, setStartDateValue] = useState<Date | null>(now);
  const [endDateValue, setEndDateValue] = useState<Date | null>(now);
  const [startTimeValue, setStartTimeValue] = useState<Date | null>(now);
  const [endTimeValue, setEndTimeValue] = useState<Date | null>(now);

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [rsvpLoadingByEvent, setRsvpLoadingByEvent] = useState<Record<string, boolean>>({});

  const formatDateForApi = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatTimeForApi = (date: Date) => {
    const h = `${date.getHours()}`.padStart(2, '0');
    const m = `${date.getMinutes()}`.padStart(2, '0');
    return `${h}:${m}`;
  };

  const getExtensionFromMime = (mimeType: string) => {
    const parts = mimeType.split('/');
    return parts.length > 1 ? parts[1] : 'bin';
  };

  const pickEventImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to attach an event image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setAsset(result.assets[0]);
    }
  };

  const uploadImageIfNeeded = async () => {
    if (!asset || !token) return null;

    const mimeType = asset.mimeType || 'image/jpeg';
    const extension = getExtensionFromMime(mimeType);
    const fileName = `${user?.id || 'church-user'}-event-${Date.now()}.${extension}`;
    const bucket = 'amc_image_bucket';

    const signedRes = await axios.post(
      `${API_URL}/uploads/signed-url`,
      { files: [{ name: fileName, type: mimeType, bucket }] },
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

    if (!uploadResponse.ok) throw new Error('Image upload failed');

    return {
      media_key: fileName,
      media_url: `https://storage.googleapis.com/${bucket}/${fileName}`,
      media_size: String(asset.fileSize || 0),
      media_type: mimeType,
    };
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const appId = await AsyncStorage.getItem('appId');
      if (!appId || !token) {
        setEvents([]);
        return;
      }
      const res = await axios.get(`${API_URL}/events?appId=${appId}&page=1&limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Fetch events error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) fetchEvents();
  }, [token]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setAsset(null);
    setStartDateValue(new Date());
    setStartTimeValue(new Date());
    setEndDateValue(new Date());
    setEndTimeValue(new Date());
    setEditingEventId(null);
  };

  const openCreateEvent = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditEvent = (event: EventItem) => {
    setTitle(event.title || '');
    setDescription(event.description || '');
    setLocation(event.location || '');
    setStartDateValue(event.startDate ? new Date(event.startDate) : new Date());
    setEndDateValue(event.endDate ? new Date(event.endDate) : new Date());
    setStartTimeValue(event.startTime ? new Date(event.startTime) : new Date());
    setEndTimeValue(event.endTime ? new Date(event.endTime) : new Date());
    setAsset(null);
    setEditingEventId(event.id);
    setShowCreateModal(true);
  };

  const deleteEvent = async (eventId: string) => {
    if (!token) return;
    try {
      await axios.delete(`${API_URL}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchEvents();
    } catch (error: any) {
      Alert.alert('Delete Event', error?.response?.data?.message || 'Unable to delete event.');
    }
  };

  const openEventOptions = (event: EventItem) => {
    Alert.alert('Event options', 'Choose an action', [
      { text: 'Edit Event', onPress: () => openEditEvent(event) },
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

  const createEvent = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter an event title.');
      return;
    }
    if (!token) {
      Alert.alert('Unauthorized', 'Please log in again.');
      return;
    }

    const appId = await AsyncStorage.getItem('appId');
    if (!appId) {
      Alert.alert('Missing App', 'No church app selected.');
      return;
    }

    setIsCreating(true);
    try {
      const uploaded = await uploadImageIfNeeded();
      const payload = {
        title: title.trim(),
        description: description.trim(),
        appId,
        startDate: startDateValue ? formatDateForApi(startDateValue) : null,
        startTime: startTimeValue ? formatTimeForApi(startTimeValue) : null,
        endDate: endDateValue ? formatDateForApi(endDateValue) : null,
        endTime: endTimeValue ? formatTimeForApi(endTimeValue) : null,
        location: location.trim() || null,
        regularity: 0,
        dayOfTheWeek: 0,
        regularityDescription: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        media: uploaded,
      };

      if (editingEventId) {
        await axios.patch(`${API_URL}/events/${editingEventId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_URL}/events`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setShowCreateModal(false);
      resetForm();
      fetchEvents();
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to create event.';
      Alert.alert('Create Event', message);
    } finally {
      setIsCreating(false);
    }
  };

  const countRsvps = (rsvps?: EventRsvp[]) => {
    const counts = { YES: 0, NO: 0, MAYBE: 0 };
    (rsvps || []).forEach((r) => {
      if (r.response === 'YES') counts.YES += 1;
      else if (r.response === 'NO') counts.NO += 1;
      else if (r.response === 'MAYBE') counts.MAYBE += 1;
    });
    return counts;
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

  const renderEvent = ({ item }: { item: EventItem }) => {
    const myRsvp = item.rsvps?.find((r) => r.church_userId === user?.id)?.response;
    const rsvpCounts = countRsvps(item.rsvps);
    const isSubmittingRsvp = !!rsvpLoadingByEvent[item.id];
    return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardTopRow}>
        <View />
        {user?.is_admin ? (
          <TouchableOpacity style={styles.eventOptionsBtn} onPress={() => openEventOptions(item)}>
            <MaterialIcons name="more-vert" size={20} color="#374151" />
          </TouchableOpacity>
        ) : null}
      </View>
      <Image source={{ uri: item.mediaUrl || DEFAULT_EVENT_THUMBNAIL }} style={styles.eventImage} />
      <Text style={styles.eventTitle}>{item.title}</Text>
      {!!item.description && (
        <Text style={styles.eventDescription}>
          {item.description.split(URL_REGEX).map((part, idx) => {
            const isUrl = /^https?:\/\//i.test(part);
            if (!isUrl) return <Text key={`txt-${idx}`}>{part}</Text>;
            return (
              <Text
                key={`url-${idx}`}
                style={styles.eventLink}
                onPress={() => Linking.openURL(part)}
              >
                {part}
              </Text>
            );
          })}
        </Text>
      )}
      {!!item.startDate && (
        <Text style={styles.eventMeta}>Start Date: {new Date(item.startDate).toLocaleDateString()}</Text>
      )}
      {!!item.startTime && (
        <Text style={styles.eventMeta}>Start Time: {new Date(item.startTime).toLocaleTimeString()}</Text>
      )}
      {!!item.endDate && (
        <Text style={styles.eventMeta}>End Date: {new Date(item.endDate).toLocaleDateString()}</Text>
      )}
      {!!item.endTime && <Text style={styles.eventMeta}>End Time: {new Date(item.endTime).toLocaleTimeString()}</Text>}
      {!!item.location && <Text style={styles.eventMeta}>Location: {item.location}</Text>}
      <View style={styles.rsvpSection}>
        <Text style={styles.rsvpLabel}>Will you attend?</Text>
        <View style={styles.rsvpBtnRow}>
          {(['YES', 'NO', 'MAYBE'] as RSVPResponse[]).map((choice) => (
            <TouchableOpacity
              key={choice}
              style={[styles.rsvpBtn, myRsvp === choice && styles.rsvpBtnActive]}
              onPress={() => submitRsvp(item.id, choice)}
              disabled={isSubmittingRsvp}
            >
              <Text style={[styles.rsvpBtnText, myRsvp === choice && styles.rsvpBtnTextActive]}>
                {choice}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.rsvpCounts}>
          Yes: {rsvpCounts.YES}  No: {rsvpCounts.NO}  Maybe: {rsvpCounts.MAYBE}
        </Text>
      </View>
    </View>
  );
};

  return (
    <View style={styles.container}>
      <Navbar />
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Events</Text>
        {user?.is_admin ? (
          <TouchableOpacity style={styles.addBtn} onPress={openCreateEvent}>
            <MaterialIcons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add Event</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEvents(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>No events added yet.</Text>}
        />
      )}

      <Modal visible={showCreateModal} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingEventId ? 'Edit Event' : 'Create Event'}</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <TextInput style={styles.input} placeholder="Title *" value={title} onChangeText={setTitle} />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Description"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <TouchableOpacity style={styles.pickerField} onPress={() => setShowStartDatePicker(true)}>
              <Text style={styles.pickerLabel}>Start Date</Text>
              <Text style={styles.pickerValue}>
                {startDateValue ? startDateValue.toLocaleDateString() : 'Select start date'}
              </Text>
            </TouchableOpacity>
            {showStartDatePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={startDateValue || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, selectedDate) => {
                    if (Platform.OS !== 'ios') setShowStartDatePicker(false);
                    if (selectedDate) setStartDateValue(selectedDate);
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowStartDatePicker(false)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TouchableOpacity style={styles.pickerField} onPress={() => setShowStartTimePicker(true)}>
              <Text style={styles.pickerLabel}>Start Time</Text>
              <Text style={styles.pickerValue}>
                {startTimeValue ? startTimeValue.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Select start time'}
              </Text>
            </TouchableOpacity>
            {showStartTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={startTimeValue || new Date()}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, selectedDate) => {
                    if (Platform.OS !== 'ios') setShowStartTimePicker(false);
                    if (selectedDate) setStartTimeValue(selectedDate);
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowStartTimePicker(false)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TouchableOpacity style={styles.pickerField} onPress={() => setShowEndDatePicker(true)}>
              <Text style={styles.pickerLabel}>End Date</Text>
              <Text style={styles.pickerValue}>
                {endDateValue ? endDateValue.toLocaleDateString() : 'Select end date'}
              </Text>
            </TouchableOpacity>
            {showEndDatePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={endDateValue || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, selectedDate) => {
                    if (Platform.OS !== 'ios') setShowEndDatePicker(false);
                    if (selectedDate) setEndDateValue(selectedDate);
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowEndDatePicker(false)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TouchableOpacity style={styles.pickerField} onPress={() => setShowEndTimePicker(true)}>
              <Text style={styles.pickerLabel}>End Time</Text>
              <Text style={styles.pickerValue}>
                {endTimeValue ? endTimeValue.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Select end time'}
              </Text>
            </TouchableOpacity>
            {showEndTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={endTimeValue || new Date()}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, selectedDate) => {
                    if (Platform.OS !== 'ios') setShowEndTimePicker(false);
                    if (selectedDate) setEndTimeValue(selectedDate);
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowEndTimePicker(false)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TextInput style={styles.input} placeholder="Location" value={location} onChangeText={setLocation} />

            <TouchableOpacity style={styles.imageAttachBtn} onPress={pickEventImage}>
              <MaterialIcons name="image" size={20} color="#007AFF" />
              <Text style={styles.imageAttachText}>Attach Event Image</Text>
            </TouchableOpacity>

            {asset ? (
              <View style={styles.previewCard}>
                <Image source={{ uri: asset.uri }} style={styles.previewImage} />
                <TouchableOpacity onPress={() => setAsset(null)} style={styles.removeAttachmentBtn}>
                  <Text style={styles.removeAttachmentText}>Remove Image</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity style={styles.submitBtn} onPress={createEvent} disabled={isCreating}>
              {isCreating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>{editingEventId ? 'Save Changes' : 'Create Event'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#222' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  listContent: { padding: 16, gap: 12 },
  eventCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
    position: 'relative',
    paddingTop: 10,
  },
  eventCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  eventOptionsBtn: { padding: 4 },
  eventImage: {
    width: '100%',
    height: 190,
    borderRadius: 10,
    marginBottom: 10,
  },
  eventTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  eventDescription: { marginTop: 6, color: '#374151', lineHeight: 20 },
  eventLink: { color: '#2563eb', textDecorationLine: 'underline' },
  eventMeta: { marginTop: 4, color: '#4b5563', fontSize: 13 },
  rsvpSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 10 },
  rsvpLabel: { fontSize: 13, color: '#374151', marginBottom: 8, fontWeight: '600' },
  rsvpBtnRow: { flexDirection: 'row', gap: 8 },
  rsvpBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff',
  },
  rsvpBtnActive: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  rsvpBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  rsvpBtnTextActive: { color: '#1d4ed8' },
  rsvpCounts: { marginTop: 8, fontSize: 12, color: '#6b7280' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 30 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalBody: { padding: 16, gap: 12, paddingBottom: Platform.OS === 'ios' ? 260 : 180 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  pickerField: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  pickerDoneBtn: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
  },
  pickerDoneText: { color: '#2563eb', fontWeight: '700', fontSize: 15 },
  pickerLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  pickerValue: { fontSize: 15, color: '#111827' },
  imageAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  imageAttachText: { color: '#007AFF', fontWeight: '600' },
  previewCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, backgroundColor: '#fafafa' },
  previewImage: { width: '100%', height: 180, borderRadius: 10 },
  removeAttachmentBtn: { marginTop: 8 },
  removeAttachmentText: { color: '#ef4444', fontWeight: '600' },
  submitBtn: {
    marginTop: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
