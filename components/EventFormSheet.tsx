import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GroupLabel, SegmentedControl, SheetHeader } from './ui';
import { colors, GUTTER, radius, shapes, text } from '../lib/theme';
import {
  describeRepeat,
  EventItem,
  eventEndDay,
  eventStartDay,
  formatClock,
  formatDateForApi,
  formatDayButton,
  formatTimeForApi,
  monthModeLabels,
  monthModeOf,
  MonthMode,
  nextOccurrence,
  parseWallClock,
  REPEAT_OPTIONS,
  repeatFields,
  repeatKindOf,
  RepeatKind,
  startOfDay,
} from '../lib/events';

const API_URL = 'https://appmychurch.com/api/v1';

type PickerField = 'startDate' | 'startTime' | 'endDate' | 'endTime';

/** A time of day on a throwaway date: only the hours and minutes are ever read. */
const clock = (hours: number, minutes = 0) => new Date(2000, 0, 1, hours, minutes);

const getExtensionFromMime = (mimeType: string) => {
  const parts = mimeType.split('/');
  return parts.length > 1 ? parts[1] : 'bin';
};

/**
 * The form an admin adds or edits an event with. It sends the same fields to
 * the same two routes the app always has (POST /events, PATCH /events/:id); the
 * repeat choice travels in `regularity` and `dayOfTheWeek`, which the server
 * has stored since the dashboard first offered them.
 */
export default function EventFormSheet({
  visible,
  event,
  defaultDay,
  token,
  userId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** The event being edited, or null for a new one. */
  event: EventItem | null;
  /** The day a new event starts on: the day picked in the calendar, else today. */
  defaultDay?: Date | null;
  token: string | null;
  userId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(startOfDay(new Date()));
  const [startTime, setStartTime] = useState<Date>(clock(10));
  const [endTime, setEndTime] = useState<Date>(clock(11));
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState<RepeatKind>('none');
  const [monthMode, setMonthMode] = useState<MonthMode>('weekday');
  const [isSaving, setIsSaving] = useState(false);
  /** Android shows one picker dialog at a time; iPhone shows its own buttons in the rows. */
  const [androidPicker, setAndroidPicker] = useState<PickerField | null>(null);

  // Fill the form each time it opens.
  useEffect(() => {
    if (!visible) return;
    const today = startOfDay(new Date());
    setAsset(null);
    setAndroidPicker(null);
    setIsSaving(false);

    if (!event) {
      const first = defaultDay ? startOfDay(defaultDay) : today;
      setTitle('');
      setDescription('');
      setLocation('');
      setStartDate(first);
      setEndDate(first);
      setStartTime(clock(10));
      setEndTime(clock(11));
      setAllDay(false);
      setRepeat('none');
      setMonthMode('weekday');
      return;
    }

    // An event made in the dashboard can repeat with no start date at all. The
    // form needs one, so it offers the next day the event falls on.
    const first = eventStartDay(event) || nextOccurrence(event, today) || today;
    const start = parseWallClock(event.startTime);
    const end = parseWallClock(event.endTime);
    setTitle(event.title || '');
    setDescription(event.description || '');
    setLocation(event.location || '');
    setStartDate(first);
    setEndDate(eventEndDay(event) || first);
    setAllDay(!start);
    setStartTime(start ? clock(start.getHours(), start.getMinutes()) : clock(10));
    setEndTime(
      end
        ? clock(end.getHours(), end.getMinutes())
        : start
        ? clock(Math.min(start.getHours() + 1, 23), start.getMinutes())
        : clock(11)
    );
    setRepeat(repeatKindOf(event));
    setMonthMode(monthModeOf(event));
  }, [visible, event, defaultDay]);

  const repeating = repeat !== 'none';

  const applyPicked = (field: PickerField, picked: Date) => {
    if (field === 'startDate') {
      const day = startOfDay(picked);
      setStartDate(day);
      if (endDate.getTime() < day.getTime()) setEndDate(day);
    } else if (field === 'endDate') {
      const day = startOfDay(picked);
      setEndDate(day.getTime() < startDate.getTime() ? startDate : day);
    } else if (field === 'startTime') {
      setStartTime(clock(picked.getHours(), picked.getMinutes()));
    } else {
      setEndTime(clock(picked.getHours(), picked.getMinutes()));
    }
  };

  const valueOf = (field: PickerField) =>
    field === 'startDate' ? startDate : field === 'endDate' ? endDate : field === 'startTime' ? startTime : endTime;

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
    const fileName = `${userId || 'church-user'}-event-${Date.now()}.${extension}`;
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

  const save = async () => {
    if (isSaving) return;
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

    setIsSaving(true);
    try {
      const uploaded = await uploadImageIfNeeded();
      const payload = {
        title: title.trim(),
        description: description.trim(),
        appId,
        startDate: formatDateForApi(startDate),
        startTime: allDay ? null : formatTimeForApi(startTime),
        // A repeating event has no last day: it repeats until it is edited or deleted.
        endDate: formatDateForApi(repeating ? startDate : endDate),
        endTime: allDay ? null : formatTimeForApi(endTime),
        location: location.trim() || null,
        ...repeatFields(repeat, monthMode, startDate),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        media: uploaded,
      };

      if (event) {
        await axios.patch(`${API_URL}/events/${event.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_URL}/events`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      onSaved();
    } catch (error: any) {
      const message = error?.response?.data?.message || (event ? 'Failed to save event.' : 'Failed to create event.');
      Alert.alert(event ? 'Edit Event' : 'Create Event', message);
    } finally {
      setIsSaving(false);
    }
  };

  /** One date or time button. iPhone draws its own compact control; Android opens a dialog. */
  const renderPicker = (field: PickerField, label: string) => {
    const mode = field === 'startDate' || field === 'endDate' ? 'date' : 'time';
    const value = valueOf(field);
    if (Platform.OS === 'ios') {
      return (
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          themeVariant="light"
          accentColor={colors.azure}
          minimumDate={field === 'endDate' ? startDate : undefined}
          onChange={(_, picked) => {
            if (picked) applyPicked(field, picked);
          }}
          accessibilityLabel={label}
        />
      );
    }
    return (
      <Pressable
        style={styles.pickerButton}
        onPress={() => setAndroidPicker(field)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.pickerButtonText}>{mode === 'date' ? formatDayButton(value) : formatClock(value)}</Text>
      </Pressable>
    );
  };

  const modeLabels = monthModeLabels(startDate);
  const repeatSentence = repeating
    ? describeRepeat(repeat, monthMode, startDate, monthMode === 'weekday' || repeat !== 'monthly' ? startDate.getDay() : null)
    : null;
  const helper = repeating
    ? `${repeatSentence}${allDay ? '' : ` at ${formatClock(startTime)}`}.`
    : `Happens once, on ${formatDayButton(startDate)}.`;

  const previewUri = asset?.uri || event?.mediaUrl || null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={shapes.page}>
        <SheetHeader
          title={event ? 'Edit Event' : 'New Event'}
          onCancel={onClose}
          actionLabel={event ? 'Save' : 'Add'}
          onAction={save}
          actionLoading={isSaving}
        />

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <View style={shapes.group}>
            <TextInput
              style={[styles.field, styles.fieldTitle]}
              placeholder="Title"
              placeholderTextColor={colors.inkFaint}
              value={title}
              onChangeText={setTitle}
              accessibilityLabel="Title"
            />
            <View style={[shapes.divider, styles.divider]} />
            <TextInput
              style={styles.field}
              placeholder="Location"
              placeholderTextColor={colors.inkFaint}
              value={location}
              onChangeText={setLocation}
              accessibilityLabel="Location"
            />
            <View style={[shapes.divider, styles.divider]} />
            <TextInput
              style={[styles.field, styles.fieldMultiline]}
              placeholder="Description"
              placeholderTextColor={colors.inkFaint}
              value={description}
              onChangeText={setDescription}
              multiline
              accessibilityLabel="Description"
            />
          </View>

          <View style={shapes.group}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>All day</Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ true: colors.azure, false: colors.fill }}
                accessibilityLabel="All day"
              />
            </View>
            <View style={[shapes.divider, styles.divider]} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Starts</Text>
              <View style={styles.pickers}>
                {renderPicker('startDate', 'Start date')}
                {allDay ? null : renderPicker('startTime', 'Start time')}
              </View>
            </View>
            {repeating && allDay ? null : (
              <>
                <View style={[shapes.divider, styles.divider]} />
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Ends</Text>
                  <View style={styles.pickers}>
                    {repeating ? null : renderPicker('endDate', 'End date')}
                    {allDay ? null : renderPicker('endTime', 'End time')}
                  </View>
                </View>
              </>
            )}
          </View>

          <View>
            <GroupLabel>Repeats</GroupLabel>
            <View style={shapes.group}>
              {REPEAT_OPTIONS.map((option, index) => {
                const on = option.kind === repeat;
                return (
                  <React.Fragment key={option.kind}>
                    {index > 0 ? <View style={[shapes.divider, styles.divider]} /> : null}
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => setRepeat(option.kind)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={option.label}
                    >
                      <Text style={[styles.rowLabel, on ? styles.rowLabelOn : null]}>{option.label}</Text>
                      {on ? <Ionicons name="checkmark" size={22} color={colors.azure} /> : null}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>

            {repeat === 'monthly' ? (
              <SegmentedControl<MonthMode>
                style={styles.monthMode}
                value={monthMode}
                onChange={setMonthMode}
                options={[
                  { value: 'weekday', label: modeLabels.weekday },
                  { value: 'date', label: modeLabels.date },
                ]}
              />
            ) : null}

            <Text style={styles.helper}>{helper}</Text>
          </View>

          <View style={shapes.group}>
            {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
            <TouchableOpacity style={styles.row} onPress={pickEventImage} accessibilityRole="button">
              <View style={styles.photoRow}>
                <Ionicons name="image-outline" size={22} color={colors.azureText} />
                <Text style={styles.photoText}>{previewUri ? 'Change photo' : 'Add a photo'}</Text>
              </View>
            </TouchableOpacity>
            {asset ? (
              <>
                <View style={[shapes.divider, styles.divider]} />
                <TouchableOpacity style={styles.row} onPress={() => setAsset(null)} accessibilityRole="button">
                  <Text style={styles.removeText}>Remove new photo</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </ScrollView>

        {Platform.OS === 'android' && androidPicker ? (
          <DateTimePicker
            value={valueOf(androidPicker)}
            mode={androidPicker === 'startDate' || androidPicker === 'endDate' ? 'date' : 'time'}
            display="default"
            minimumDate={androidPicker === 'endDate' ? startDate : undefined}
            onChange={(pickerEvent, picked) => {
              const field = androidPicker;
              setAndroidPicker(null);
              if (pickerEvent.type === 'set' && picked) applyPicked(field, picked);
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 60, gap: 22 },
  field: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: colors.ink },
  fieldTitle: { fontWeight: '600' },
  fieldMultiline: { minHeight: 96, textAlignVertical: 'top' },
  divider: { marginLeft: 16 },
  row: {
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: { fontSize: 17, color: colors.ink },
  rowLabelOn: { fontWeight: '600' },
  pickers: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pickerButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.fillSoft,
    justifyContent: 'center',
  },
  pickerButtonText: { fontSize: 16, color: colors.ink },
  monthMode: { marginTop: 10 },
  helper: { ...text.footnote, marginTop: 8, marginHorizontal: GUTTER },
  preview: { width: '100%', height: 180, backgroundColor: colors.fillSoft },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoText: { fontSize: 17, color: colors.azureText },
  removeText: { fontSize: 17, color: colors.red },
});
