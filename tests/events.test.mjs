// The date rules of the Events tab. Run with `npm test`, which repeats the file
// in three time zones: an event's day and time must never move with the phone's
// clock. Keep this file identical in both phone apps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonth,
  buildUpcoming,
  dayKey,
  describeRepeat,
  formatDayLong,
  formatTimeRange,
  isRepeating,
  isUndated,
  monthGrid,
  monthModeLabels,
  nextOccurrence,
  occursOn,
  parseWallClock,
  repeatFields,
  repeatKindOf,
  repeatLabelLong,
  repeatLabelShort,
  rowMeta,
} from '../lib/events.ts';

/** An event shaped the way GET /api/v1/events returns it. */
let nextId = 1;
function ev({ title = 'Event', date, endDate, time, endTime, regularity = 0, dow = 0, location = null, created = '2026-01-05' } = {}) {
  return {
    id: String(nextId++),
    title,
    location,
    startDate: date ? `${date}T00:00:00.000Z` : null,
    endDate: endDate ? `${endDate}T00:00:00.000Z` : null,
    startTime: time ? `1970-01-01T${time}:00.000Z` : null,
    endTime: endTime ? `1970-01-01T${endTime}:00.000Z` : null,
    regularity,
    dayOfTheWeek: dow,
    regularityDescription: null,
    createdAt: `${created}T15:00:00.000Z`,
    rsvps: [],
  };
}

const day = (y, m, d) => new Date(y, m - 1, d);
const keys = (rows) => rows.map((row) => `${row.event.title}@${row.day ? dayKey(row.day) : 'none'}`);

test('a stored time is read as it was entered, in any time zone', () => {
  const six = parseWallClock('1970-01-01T18:00:00.000Z');
  assert.equal(six.getHours(), 18);
  assert.equal(six.getMinutes(), 0);
  const date = parseWallClock('2026-11-22T00:00:00.000Z');
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 10, 22]);
  // Older rows carry the event's date in the time field; only the time of day counts.
  assert.equal(parseWallClock('2024-12-04T09:10:00.000Z').getHours(), 9);
  assert.equal(parseWallClock(null), null);
  assert.equal(parseWallClock('nonsense'), null);
});

test('a one-time event happens on its day only, and is over afterwards', () => {
  const potluck = ev({ date: '2026-11-22', time: '12:30' });
  assert.equal(repeatKindOf(potluck), 'none');
  assert.equal(occursOn(potluck, day(2026, 11, 22)), true);
  assert.equal(occursOn(potluck, day(2026, 11, 21)), false);
  assert.equal(occursOn(potluck, day(2026, 11, 23)), false);
  assert.equal(dayKey(nextOccurrence(potluck, day(2026, 11, 18))), '2026-11-22');
  assert.equal(dayKey(nextOccurrence(potluck, day(2026, 11, 22))), '2026-11-22');
  assert.equal(nextOccurrence(potluck, day(2026, 11, 23)), null);
});

test('a one-time event over several days is still on until its last day', () => {
  const retreat = ev({ date: '2026-06-09', endDate: '2026-06-14' });
  assert.equal(occursOn(retreat, day(2026, 6, 9)), true);
  assert.equal(occursOn(retreat, day(2026, 6, 14)), true);
  assert.equal(occursOn(retreat, day(2026, 6, 15)), false);
  assert.equal(dayKey(nextOccurrence(retreat, day(2026, 6, 1))), '2026-06-09');
  assert.equal(dayKey(nextOccurrence(retreat, day(2026, 6, 11))), '2026-06-11');
  assert.equal(nextOccurrence(retreat, day(2026, 6, 15)), null);
});

test('an end date before the start date is ignored', () => {
  const healing = ev({ date: '2026-03-08', endDate: '2026-02-27', time: '18:00', endTime: '06:54' });
  assert.equal(occursOn(healing, day(2026, 3, 8)), true);
  assert.equal(occursOn(healing, day(2026, 3, 1)), false);
  assert.equal(formatTimeRange(healing), '6:00 PM');
});

test('weekly with a day of the week and no date: every week on that day', () => {
  const bibleStudy = ev({ regularity: 1, dow: 4, time: '18:30' });
  assert.equal(repeatKindOf(bibleStudy), 'weekly');
  assert.equal(occursOn(bibleStudy, day(2026, 11, 18)), true); // a Wednesday
  assert.equal(occursOn(bibleStudy, day(2026, 11, 19)), false);
  assert.equal(dayKey(nextOccurrence(bibleStudy, day(2026, 11, 19))), '2026-11-25');
  assert.equal(repeatLabelLong(bibleStudy), 'Every Wednesday');
  assert.equal(repeatLabelShort(bibleStudy), 'Weekly');
});

test('a day of the week with no date and no frequency is read as weekly', () => {
  const liveStream = ev({ regularity: 0, dow: 1, time: '10:30' });
  assert.equal(repeatKindOf(liveStream), 'weekly');
  assert.equal(occursOn(liveStream, day(2026, 11, 22)), true); // a Sunday
  assert.equal(isUndated(liveStream), false);
});

test('a one-time event with a date keeps its date even if a day of the week is stored', () => {
  const eggHunt = ev({ date: '2026-04-08', dow: 4 });
  assert.equal(repeatKindOf(eggHunt), 'none');
  assert.equal(occursOn(eggHunt, day(2026, 4, 15)), false);
});

test('weekly with a start date: never before it, every week after', () => {
  const worship = ev({ regularity: 1, dow: 1, date: '2026-11-22', time: '10:30' });
  assert.equal(occursOn(worship, day(2026, 11, 15)), false);
  assert.equal(occursOn(worship, day(2026, 11, 22)), true);
  assert.equal(occursOn(worship, day(2026, 11, 29)), true);
  assert.equal(occursOn(worship, day(2027, 3, 14)), true); // across a clock change
  assert.equal(occursOn(worship, day(2027, 3, 15)), false);
});

test('weekly takes its day from the start date when no day of the week is stored', () => {
  const youth = ev({ regularity: 1, date: '2026-11-20' }); // a Friday
  assert.equal(occursOn(youth, day(2026, 11, 27)), true);
  assert.equal(occursOn(youth, day(2026, 11, 26)), false);
});

test('every two weeks counts from the start date', () => {
  const group = ev({ regularity: 2, dow: 4, date: '2026-10-21' }); // a Wednesday
  assert.equal(occursOn(group, day(2026, 10, 21)), true);
  assert.equal(occursOn(group, day(2026, 10, 28)), false);
  assert.equal(occursOn(group, day(2026, 11, 4)), true); // across the November clock change
  assert.equal(occursOn(group, day(2026, 11, 11)), false);
  assert.equal(occursOn(group, day(2026, 11, 18)), true);
  assert.equal(repeatLabelLong(group), 'Every other Wednesday');
});

test('monthly on a weekday: the first Saturday stays the first Saturday', () => {
  const breakfast = ev({ regularity: 3, dow: 7, date: '2026-11-07', time: '08:00' });
  assert.equal(occursOn(breakfast, day(2026, 11, 7)), true);
  assert.equal(occursOn(breakfast, day(2026, 11, 14)), false);
  assert.equal(occursOn(breakfast, day(2026, 12, 5)), true);
  assert.equal(occursOn(breakfast, day(2026, 12, 7)), false);
  assert.equal(occursOn(breakfast, day(2027, 1, 2)), true);
  assert.equal(repeatLabelLong(breakfast), 'First Saturday of every month');
  assert.equal(dayKey(nextOccurrence(breakfast, day(2026, 11, 18))), '2026-12-05');
});

test('monthly on a date: the 18th stays the 18th', () => {
  const meeting = ev({ regularity: 3, dow: 0, date: '2026-11-18' });
  assert.equal(occursOn(meeting, day(2026, 12, 18)), true);
  assert.equal(occursOn(meeting, day(2026, 12, 16)), false);
  assert.equal(repeatLabelLong(meeting), 'The 18th of every month');
});

test('monthly on the 31st lands on the last day of a shorter month', () => {
  const closing = ev({ regularity: 3, date: '2026-01-31' });
  assert.equal(occursOn(closing, day(2026, 2, 28)), true);
  assert.equal(occursOn(closing, day(2026, 4, 30)), true);
  assert.equal(occursOn(closing, day(2026, 3, 30)), false);
  assert.equal(occursOn(closing, day(2026, 3, 31)), true);
});

test('monthly on a fifth weekday means the last one of each month', () => {
  const fifthSunday = ev({ regularity: 3, dow: 1, date: '2026-11-29' });
  assert.equal(occursOn(fifthSunday, day(2026, 11, 29)), true);
  assert.equal(occursOn(fifthSunday, day(2026, 12, 20)), false);
  assert.equal(occursOn(fifthSunday, day(2026, 12, 27)), true);
  assert.equal(repeatLabelLong(fifthSunday), 'Last Sunday of every month');
});

test('yearly comes back on the same date', () => {
  const candlelight = ev({ regularity: 4, date: '2025-12-24' });
  assert.equal(occursOn(candlelight, day(2026, 12, 24)), true);
  assert.equal(occursOn(candlelight, day(2026, 12, 25)), false);
  assert.equal(dayKey(nextOccurrence(candlelight, day(2026, 11, 18))), '2026-12-24');
  assert.equal(repeatLabelLong(candlelight), 'Every year on December 24');
  const leapDay = ev({ regularity: 4, date: '2024-02-29' });
  assert.equal(occursOn(leapDay, day(2026, 2, 28)), true);
  assert.equal(occursOn(leapDay, day(2028, 2, 29)), true);
});

test('an event with no date and no day of the week cannot be placed', () => {
  const someday = ev({});
  assert.equal(isUndated(someday), true);
  assert.equal(isRepeating(someday), false);
  assert.equal(nextOccurrence(someday, day(2026, 11, 18)), null);
});

test('the Upcoming list: each repeating event once, in date and time order', () => {
  const events = [
    ev({ title: 'Christmas Eve', date: '2026-12-24', time: '18:00' }),
    ev({ title: 'Potluck', date: '2026-11-22', time: '12:30' }),
    ev({ title: 'Sunday Worship', regularity: 1, dow: 1, time: '10:30' }),
    ev({ title: 'Bible Study', regularity: 1, dow: 4, time: '18:30' }),
    ev({ title: 'Youth Night', regularity: 1, dow: 6, time: '19:00' }),
    ev({ title: 'Food Drive', date: '2026-11-21', time: '09:00' }),
    ev({ title: 'Breakfast', regularity: 3, dow: 7, date: '2026-11-07', time: '08:00' }),
    ev({ title: 'Last Easter', date: '2026-04-05' }),
    ev({ title: 'No date yet' }),
  ];
  const sections = buildUpcoming(events, new Date(2026, 10, 18, 9, 0)); // Wednesday morning
  assert.deepEqual(keys(sections.today), ['Bible Study@2026-11-18']);
  assert.deepEqual(keys(sections.week), [
    'Youth Night@2026-11-20',
    'Food Drive@2026-11-21',
    'Sunday Worship@2026-11-22',
    'Potluck@2026-11-22',
  ]);
  assert.deepEqual(keys(sections.later), ['Breakfast@2026-12-05', 'Christmas Eve@2026-12-24']);
  assert.deepEqual(keys(sections.undated), ['No date yet@none']);
});

test('a month of the calendar: every day an event falls on', () => {
  const events = [
    ev({ title: 'Sunday Worship', regularity: 1, dow: 1, time: '10:30' }),
    ev({ title: 'Potluck', date: '2026-11-22', time: '12:30' }),
    ev({ title: 'Retreat', date: '2026-11-27', endDate: '2026-11-29' }),
  ];
  const month = buildMonth(events, 2026, 10);
  assert.deepEqual(month['2026-11-01'].map((e) => e.title), ['Sunday Worship']);
  assert.deepEqual(month['2026-11-22'].map((e) => e.title), ['Sunday Worship', 'Potluck']);
  assert.deepEqual(month['2026-11-28'].map((e) => e.title), ['Retreat']);
  assert.deepEqual(month['2026-11-29'].map((e) => e.title), ['Sunday Worship', 'Retreat']);
  assert.equal(month['2026-11-23'], undefined);
  assert.equal(month['2026-12-06'], undefined);
});

test('the month grid has whole weeks, Sunday first', () => {
  const november = monthGrid(2026, 10); // starts on a Sunday
  assert.equal(november.length, 35);
  assert.equal(november[0].getDate(), 1);
  assert.equal(november[29].getDate(), 30);
  assert.equal(november[30], null);
  const december = monthGrid(2026, 11); // starts on a Tuesday
  assert.equal(december[0], null);
  assert.equal(december[2].getDate(), 1);
  assert.equal(december.length % 7, 0);
});

test('what the form sends for each repeat choice', () => {
  const wednesday = day(2026, 11, 18);
  assert.deepEqual(repeatFields('none', 'weekday', wednesday), {
    regularity: 0,
    dayOfTheWeek: 0,
    regularityDescription: null,
  });
  assert.deepEqual(repeatFields('weekly', 'weekday', wednesday), {
    regularity: 1,
    dayOfTheWeek: 4,
    regularityDescription: 'Every Wednesday',
  });
  assert.deepEqual(repeatFields('biweekly', 'date', wednesday), {
    regularity: 2,
    dayOfTheWeek: 4,
    regularityDescription: 'Every other Wednesday',
  });
  assert.deepEqual(repeatFields('monthly', 'weekday', wednesday), {
    regularity: 3,
    dayOfTheWeek: 4,
    regularityDescription: 'Third Wednesday of every month',
  });
  assert.deepEqual(repeatFields('monthly', 'date', wednesday), {
    regularity: 3,
    dayOfTheWeek: 0,
    regularityDescription: 'The 18th of every month',
  });
  assert.deepEqual(repeatFields('yearly', 'date', wednesday), {
    regularity: 4,
    dayOfTheWeek: 0,
    regularityDescription: 'Every year on November 18',
  });
  assert.deepEqual(monthModeLabels(wednesday), { weekday: 'Third Wednesday', date: 'The 18th' });
  assert.equal(describeRepeat('monthly', 'date', day(2026, 11, 1), null), 'The 1st of every month');
  assert.equal(describeRepeat('monthly', 'date', day(2026, 11, 22), null), 'The 22nd of every month');
  assert.equal(describeRepeat('monthly', 'date', day(2026, 11, 13), null), 'The 13th of every month');
});

test('what the form sends is read back as the same rule', () => {
  const wednesday = day(2026, 11, 18);
  for (const [kind, mode] of [['weekly', 'weekday'], ['biweekly', 'weekday'], ['monthly', 'weekday'], ['monthly', 'date'], ['yearly', 'date']]) {
    const fields = repeatFields(kind, mode, wednesday);
    const saved = ev({ date: '2026-11-18', regularity: fields.regularity, dow: fields.dayOfTheWeek });
    assert.equal(repeatKindOf(saved), kind);
    assert.equal(repeatLabelLong(saved), fields.regularityDescription);
    assert.equal(occursOn(saved, wednesday), true);
  }
});

test('words: times, days and the line under an event', () => {
  const study = ev({ regularity: 1, dow: 4, time: '18:30', endTime: '20:00', location: 'Room 204' });
  const today = day(2026, 11, 18);
  assert.equal(formatTimeRange(study), '6:30 PM to 8:00 PM');
  assert.equal(rowMeta(study, today, today), 'Today, 6:30 PM · Room 204');
  assert.equal(rowMeta(study, day(2026, 11, 19), today), 'Tomorrow, 6:30 PM · Room 204');
  assert.equal(rowMeta(study, day(2026, 11, 25), today), 'Wed, 6:30 PM · Room 204');
  assert.equal(formatTimeRange(ev({ date: '2026-11-22', time: '00:00', endTime: '12:05' })), '12:00 AM to 12:05 PM');
  assert.equal(formatTimeRange(ev({ date: '2026-11-22' })), null);
  assert.equal(rowMeta(ev({ date: '2026-11-22' }), day(2026, 11, 22), today), 'Sun');
  assert.equal(
    rowMeta(ev({ date: '2026-06-09', endDate: '2026-06-14', location: 'Camp' }), day(2026, 6, 9), today),
    'Jun 9 to Jun 14 · Camp'
  );
  assert.equal(formatDayLong(day(2026, 11, 22), today), 'Sunday, November 22');
  assert.equal(formatDayLong(day(2027, 1, 3), today), 'Sunday, January 3, 2027');
});
