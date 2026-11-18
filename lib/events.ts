/**
 * Everything the Events tab knows about dates: when an event happens, when it
 * happens next, and how to say so.
 *
 * This file has no React and no React Native in it on purpose, so the rules can
 * be tested with plain Node (`npm test`, see tests/events.test.mjs). Keep it
 * identical in both phone apps.
 *
 * How the server stores an event (see app-my-church/app/api/v1/events):
 *   startDate / endDate  "2026-11-22T00:00:00.000Z"  the day, at midnight UTC
 *   startTime / endTime  "1970-01-01T18:30:00.000Z"  the time, in the UTC fields
 * Both are the wall clock the admin picked, with no time zone. They must be read
 * back from the UTC fields (`parseWallClock`), never converted to local time.
 *
 *   regularity     0 one-time, 1 weekly, 2 every two weeks, 3 monthly, 4 yearly
 *   dayOfTheWeek   0 none, 1 Sunday ... 7 Saturday
 * A monthly event with a day of the week repeats on "the third Wednesday";
 * without one it repeats on "the 18th". Both come from its start date.
 */

export type RSVPResponse = 'YES' | 'NO' | 'MAYBE';

export interface EventRsvp {
  id: string;
  church_userId: string;
  eventId: string;
  response: RSVPResponse;
  church_user?: {
    id: string;
    name: string | null;
    profile_picture_url: string | null;
  };
}

export interface EventItem {
  id: string;
  title: string;
  description?: string | null;
  mediaUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  regularity?: number | null;
  dayOfTheWeek?: number | null;
  regularityDescription?: string | null;
  createdAt: string;
  rsvps?: EventRsvp[];
}

export type RepeatKind = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
/** How a monthly event picks its day: "the third Wednesday" or "the 18th". */
export type MonthMode = 'weekday' | 'date';

export const REPEAT_OPTIONS: { kind: RepeatKind; label: string }[] = [
  { kind: 'none', label: 'Never' },
  { kind: 'weekly', label: 'Every week' },
  { kind: 'biweekly', label: 'Every 2 weeks' },
  { kind: 'monthly', label: 'Every month' },
  { kind: 'yearly', label: 'Every year' },
];

const REGULARITY: Record<RepeatKind, number> = { none: 0, weekly: 1, biweekly: 2, monthly: 3, yearly: 4 };

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'];

/* ------------------------------------------------------------------- Days */

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A key for a day, for use in maps: "2026-11-22". */
export function dayKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Whole days from `a` to `b`. Rounded, so a daylight-saving change cannot make it 6.96. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/* -------------------------------------------------- Reading stored values */

/**
 * Rebuilds a local Date from a stored value's UTC fields, so the local getters
 * return exactly what the admin entered. `new Date(value).toLocaleTimeString()`
 * would shift a 6:00 PM event to 12:00 PM six hours west of UTC.
 */
export function parseWallClock(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    parsed.getUTCHours(),
    parsed.getUTCMinutes(),
    parsed.getUTCSeconds()
  );
}

export function eventStartDay(event: EventItem): Date | null {
  const start = parseWallClock(event.startDate);
  return start ? startOfDay(start) : null;
}

/** The last day of a one-time event. Never earlier than its first day. */
export function eventEndDay(event: EventItem): Date | null {
  const start = eventStartDay(event);
  const end = parseWallClock(event.endDate);
  if (!start) return null;
  if (!end) return start;
  const endDay = startOfDay(end);
  return endDay.getTime() >= start.getTime() ? endDay : start;
}

/** Minutes after midnight, or null when the event has no time. */
export function minutesOfDay(value?: string | null): number | null {
  const time = parseWallClock(value);
  return time ? time.getHours() * 60 + time.getMinutes() : null;
}

export function formatDateForApi(date: Date): string {
  return dayKey(date);
}

export function formatTimeForApi(date: Date): string {
  const h = `${date.getHours()}`.padStart(2, '0');
  const m = `${date.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

/* ---------------------------------------------------------------- Repeats */

export function repeatKindOf(event: EventItem): RepeatKind {
  const regularity = Number(event.regularity) || 0;
  if (regularity === 1) return 'weekly';
  if (regularity === 2) return 'biweekly';
  if (regularity === 3) return 'monthly';
  if (regularity === 4) return 'yearly';
  // The dashboard lets an admin pick "Sunday" and leave the date and the
  // frequency alone. A day of the week with no date can only mean every week.
  if (!event.startDate && storedWeekday(event) !== null) return 'weekly';
  return 'none';
}

export function isRepeating(event: EventItem): boolean {
  return repeatKindOf(event) !== 'none';
}

/** 0 Sunday ... 6 Saturday from the stored 1...7, or null when none is stored. */
function storedWeekday(event: EventItem): number | null {
  const stored = Number(event.dayOfTheWeek) || 0;
  return stored >= 1 && stored <= 7 ? stored - 1 : null;
}

/** The weekday a weekly event falls on: the stored one, else the start date's. */
function weekdayOf(event: EventItem): number | null {
  const stored = storedWeekday(event);
  if (stored !== null) return stored;
  const start = eventStartDay(event);
  return start ? start.getDay() : null;
}

export function monthModeOf(event: EventItem): MonthMode {
  return storedWeekday(event) !== null ? 'weekday' : 'date';
}

/** Which one of its kind in the month a day is: the 18th is the third Wednesday (3). The fifth counts as "last" (5). */
export function weekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

function isLastOfItsWeekday(day: Date): boolean {
  return day.getDate() + 7 > daysInMonth(day);
}

/** Does the event happen on this day? `day` must be a local midnight. */
export function occursOn(event: EventItem, day: Date): boolean {
  const kind = repeatKindOf(event);
  const start = eventStartDay(event);

  if (kind === 'none') {
    if (!start) return false;
    const end = eventEndDay(event) || start;
    return day.getTime() >= start.getTime() && day.getTime() <= end.getTime();
  }

  // A repeating event never happens before its first day, and has no last day:
  // it repeats until someone edits or deletes it.
  if (start && day.getTime() < start.getTime()) return false;

  if (kind === 'weekly' || kind === 'biweekly') {
    const weekday = weekdayOf(event);
    if (weekday === null || day.getDay() !== weekday) return false;
    if (kind === 'weekly') return true;
    // Every two weeks needs a week to count from: the start date, or the day
    // the event was made when it has none.
    const from = start || startOfDay(parseWallClock(event.createdAt) || new Date(2000, 0, 2));
    const first = addDays(from, (weekday - from.getDay() + 7) % 7);
    const weeks = Math.round(daysBetween(first, day) / 7);
    return weeks >= 0 && weeks % 2 === 0;
  }

  if (kind === 'monthly') {
    const weekday = storedWeekday(event);
    if (weekday !== null) {
      if (day.getDay() !== weekday) return false;
      const nth = start ? weekOfMonth(start) : 1;
      return nth >= 5 ? isLastOfItsWeekday(day) : weekOfMonth(day) === nth;
    }
    if (!start) return false;
    // "The 31st" lands on the last day of a shorter month.
    return day.getDate() === Math.min(start.getDate(), daysInMonth(day));
  }

  // Yearly. February 29 lands on the 28th in other years.
  if (!start) return false;
  if (day.getMonth() !== start.getMonth()) return false;
  return day.getDate() === Math.min(start.getDate(), daysInMonth(day));
}

/** Every day from `from` to `to` (both included) on which the event happens. */
export function occurrencesBetween(event: EventItem, from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const last = startOfDay(to).getTime();
  for (let day = startOfDay(from); day.getTime() <= last; day = addDays(day, 1)) {
    if (occursOn(event, day)) days.push(day);
  }
  return days;
}

/**
 * The next day the event happens, today included. Null when it is over (a
 * one-time event in the past) or has no date at all.
 */
export function nextOccurrence(event: EventItem, today: Date): Date | null {
  const from = startOfDay(today);
  if (!isRepeating(event)) {
    const start = eventStartDay(event);
    if (!start) return null;
    const end = eventEndDay(event) || start;
    if (end.getTime() < from.getTime()) return null;
    // An event that began yesterday and ends tomorrow is happening today.
    return start.getTime() >= from.getTime() ? start : from;
  }
  // A yearly event is at most a year away; anything else is closer.
  for (let offset = 0; offset <= 370; offset++) {
    const day = addDays(from, offset);
    if (occursOn(event, day)) return day;
  }
  return null;
}

/** One-time, with no date and no day of the week: it cannot be placed on a calendar. */
export function isUndated(event: EventItem): boolean {
  return !isRepeating(event) && !eventStartDay(event);
}

/* ------------------------------------------------------------------ Words */

/** "Weekly", for the right-hand side of a row. */
export function repeatLabelShort(event: EventItem): string | null {
  switch (repeatKindOf(event)) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      return null;
  }
}

/** A sentence for a repeat rule on a given first day: "Every Wednesday". */
export function describeRepeat(kind: RepeatKind, monthMode: MonthMode, firstDay: Date | null, weekday: number | null): string | null {
  const dayName = weekday !== null ? WEEKDAYS[weekday] : firstDay ? WEEKDAYS[firstDay.getDay()] : null;
  switch (kind) {
    case 'weekly':
      return dayName ? `Every ${dayName}` : 'Every week';
    case 'biweekly':
      return dayName ? `Every other ${dayName}` : 'Every 2 weeks';
    case 'monthly':
      if (monthMode === 'weekday' && dayName) {
        const nth = firstDay ? weekOfMonth(firstDay) : 1;
        return `${capitalize(ORDINALS[Math.min(nth, 5) - 1])} ${dayName} of every month`;
      }
      return firstDay ? `The ${ordinalDay(firstDay.getDate())} of every month` : 'Every month';
    case 'yearly':
      return firstDay ? `Every year on ${MONTHS[firstDay.getMonth()]} ${firstDay.getDate()}` : 'Every year';
    default:
      return null;
  }
}

/** "Every Wednesday", for an event's details. */
export function repeatLabelLong(event: EventItem): string | null {
  return describeRepeat(repeatKindOf(event), monthModeOf(event), eventStartDay(event), weekdayOf(event));
}

/** The two choices a monthly event has for a given first day: "Third Wednesday" and "The 18th". */
export function monthModeLabels(firstDay: Date): { weekday: string; date: string } {
  const nth = Math.min(weekOfMonth(firstDay), 5);
  return {
    weekday: `${capitalize(ORDINALS[nth - 1])} ${WEEKDAYS[firstDay.getDay()]}`,
    date: `The ${ordinalDay(firstDay.getDate())}`,
  };
}

/** What the form sends to the server for a repeat choice. */
export function repeatFields(
  kind: RepeatKind,
  monthMode: MonthMode,
  firstDay: Date
): { regularity: number; dayOfTheWeek: number; regularityDescription: string | null } {
  const usesWeekday = kind === 'weekly' || kind === 'biweekly' || (kind === 'monthly' && monthMode === 'weekday');
  return {
    regularity: REGULARITY[kind],
    dayOfTheWeek: usesWeekday ? firstDay.getDay() + 1 : 0,
    regularityDescription: describeRepeat(kind, monthMode, firstDay, usesWeekday ? firstDay.getDay() : null),
  };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  const ones = day % 10;
  return `${day}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}

/** "6:30 PM" from minutes after midnight. */
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${`${m}`.padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "6:30 PM" from a Date's local time. */
export function formatClock(date: Date): string {
  return formatMinutes(date.getHours() * 60 + date.getMinutes());
}

/** "6:30 PM", or null when the event has no start time. */
export function formatStartTime(event: EventItem): string | null {
  const start = minutesOfDay(event.startTime);
  return start === null ? null : formatMinutes(start);
}

/** "6:30 PM to 8:00 PM". The end is left out when it is missing or not after the start. */
export function formatTimeRange(event: EventItem): string | null {
  const start = minutesOfDay(event.startTime);
  if (start === null) return null;
  const end = minutesOfDay(event.endTime);
  const sameDayEvent = isRepeating(event) || !eventEndDay(event) || sameDay(eventEndDay(event)!, eventStartDay(event)!);
  if (end === null || (sameDayEvent && end <= start)) return formatMinutes(start);
  return `${formatMinutes(start)} to ${formatMinutes(end)}`;
}

/** "Sunday, November 22". The year is added when it is not this year. */
export function formatDayLong(day: Date, today: Date = new Date()): string {
  const base = `${WEEKDAYS[day.getDay()]}, ${MONTHS[day.getMonth()]} ${day.getDate()}`;
  return day.getFullYear() === today.getFullYear() ? base : `${base}, ${day.getFullYear()}`;
}

/** "Nov 22". */
export function formatDayShort(day: Date): string {
  return `${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}`;
}

/** "Wed, Nov 18", for the date button in the form. */
export function formatDayButton(day: Date): string {
  return `${WEEKDAYS_SHORT[day.getDay()]}, ${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}`;
}

/** Is this a one-time event that runs over more than one day? */
export function isMultiDay(event: EventItem): boolean {
  if (isRepeating(event)) return false;
  const start = eventStartDay(event);
  const end = eventEndDay(event);
  return !!start && !!end && !sameDay(start, end);
}

/**
 * The grey line under an event's name in a list: "Fri, 7:00 PM · Youth Building".
 * `day` is the day the row stands for.
 */
export function rowMeta(event: EventItem, day: Date | null, today: Date): string {
  const parts: string[] = [];
  const time = formatStartTime(event);
  if (isMultiDay(event)) {
    parts.push(`${formatDayShort(eventStartDay(event)!)} to ${formatDayShort(eventEndDay(event)!)}`);
  } else if (day) {
    const dayWord = sameDay(day, today)
      ? 'Today'
      : sameDay(day, addDays(today, 1))
      ? 'Tomorrow'
      : WEEKDAYS_SHORT[day.getDay()];
    parts.push(time ? `${dayWord}, ${time}` : dayWord);
  } else if (time) {
    parts.push(time);
  }
  if (event.location) parts.push(event.location);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ Lists */

export interface EventRow {
  event: EventItem;
  /** The day this row stands for. Null only for an event with no date. */
  day: Date | null;
}

export interface UpcomingSections {
  today: EventRow[];
  /** The six days after today. */
  week: EventRow[];
  later: EventRow[];
  /** One-time events with no date: kept visible so an admin can find and fix them. */
  undated: EventRow[];
}

function byDayThenTime(a: EventRow, b: EventRow): number {
  const dayDiff = (a.day ? a.day.getTime() : Infinity) - (b.day ? b.day.getTime() : Infinity);
  if (dayDiff !== 0) return dayDiff;
  const timeDiff = (minutesOfDay(a.event.startTime) ?? 24 * 60) - (minutesOfDay(b.event.startTime) ?? 24 * 60);
  if (timeDiff !== 0) return timeDiff;
  return a.event.title.localeCompare(b.event.title);
}

/**
 * The Upcoming list. A repeating event appears once, at its next day, so the
 * list is not the same service fifty times. Past one-time events drop off.
 */
export function buildUpcoming(events: EventItem[], now: Date): UpcomingSections {
  const today = startOfDay(now);
  const weekEnd = addDays(today, 6);
  const sections: UpcomingSections = { today: [], week: [], later: [], undated: [] };

  for (const event of events) {
    if (isUndated(event)) {
      sections.undated.push({ event, day: null });
      continue;
    }
    const day = nextOccurrence(event, today);
    if (!day) continue;
    const row = { event, day };
    if (sameDay(day, today)) sections.today.push(row);
    else if (day.getTime() <= weekEnd.getTime()) sections.week.push(row);
    else sections.later.push(row);
  }

  sections.today.sort(byDayThenTime);
  sections.week.sort(byDayThenTime);
  sections.later.sort(byDayThenTime);
  sections.undated.sort((a, b) => a.event.title.localeCompare(b.event.title));
  return sections;
}

/** The events of each day of a month, keyed by `dayKey`, each day's list in time order. */
export function buildMonth(events: EventItem[], year: number, month: number): Record<string, EventItem[]> {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const byDay: Record<string, EventItem[]> = {};
  for (const event of events) {
    for (const day of occurrencesBetween(event, first, last)) {
      const key = dayKey(day);
      (byDay[key] = byDay[key] || []).push(event);
    }
  }
  for (const key of Object.keys(byDay)) {
    byDay[key].sort(
      (a, b) =>
        (minutesOfDay(a.startTime) ?? 24 * 60) - (minutesOfDay(b.startTime) ?? 24 * 60) ||
        a.title.localeCompare(b.title)
    );
  }
  return byDay;
}

/**
 * The cells of a month's grid, Sunday first: null for the blanks before the 1st
 * and after the last day, so every row has seven cells.
 */
export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const count = daysInMonth(first);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ------------------------------------------------------------------ RSVPs */

export function myRsvp(event: EventItem, userId?: string | null): RSVPResponse | null {
  if (!userId) return null;
  return event.rsvps?.find((r) => r.church_userId === userId)?.response ?? null;
}

export function countRsvps(rsvps?: EventRsvp[]): Record<RSVPResponse, number> {
  const counts = { YES: 0, NO: 0, MAYBE: 0 };
  (rsvps || []).forEach((r) => {
    if (r.response === 'YES') counts.YES += 1;
    else if (r.response === 'NO') counts.NO += 1;
    else if (r.response === 'MAYBE') counts.MAYBE += 1;
  });
  return counts;
}

/** Friendlier words for the three answers. What the app sends stays YES / MAYBE / NO. */
export const RSVP_CHOICES: { value: RSVPResponse; label: string }[] = [
  { value: 'YES', label: 'Going' },
  { value: 'MAYBE', label: 'Maybe' },
  { value: 'NO', label: "Can't go" },
];

export function rsvpLabel(response: RSVPResponse): string {
  return RSVP_CHOICES.find((choice) => choice.value === response)?.label || response;
}
