// Closure calendar: built-in statutory holidays for British Columbia and Ontario, plus the clinic's own
// closure dates and ranges. A closed day is never offered, even when the EMR template has hours that day.
//
// Rules used (checked by hand for 2026 to 2028 and covered by tests for 2026 and 2027):
//   New Year's Day 1 Jan; Family Day third Monday of February; Good Friday (Easter minus two days);
//   Victoria Day the Monday before 25 May; Canada Day 1 Jul; BC Day / Civic Holiday first Monday of August;
//   Labour Day first Monday of September; National Day for Truth and Reconciliation 30 Sep (BC only);
//   Thanksgiving second Monday of October; Remembrance Day 11 Nov (BC only); Christmas Day 25 Dec;
//   Boxing Day 26 Dec (Ontario only).
// A fixed-date holiday that falls on a weekend also blocks the weekday it is observed on: the next weekday
// that is not already a holiday (so Christmas on a Saturday is observed Monday, and Boxing Day on the
// Sunday after it is observed Tuesday).
import { addDays, isValidDate, weekdayOf } from './time.js';

export const PROVINCES = { none: 'No built-in holidays', BC: 'British Columbia', ON: 'Ontario' };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Nth (1-based) Monday of a month. */
function nthMonday(y, m, n) {
  let d = ymd(y, m, 1);
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return addDays(d, 7 * (n - 1));
}

/** Monday before 25 May. */
function victoriaDay(y) {
  let d = ymd(y, 5, 24);
  while (weekdayOf(d) !== 1) d = addDays(d, -1);
  return d;
}

/** Easter Sunday, Gregorian calendar (Meeus/Jones/Butcher). */
function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

/**
 * Statutory holidays for a province and year, in date order: [{ date, name, observed? }].
 * `date` is the holiday itself; `observed` is the weekday that is also closed when `date` is a weekend.
 */
export function statutoryHolidays(province, year) {
  if (!PROVINCES[province] || province === 'none') return [];
  const bc = province === 'BC';
  const list = [
    { date: ymd(year, 1, 1), name: "New Year's Day", fixed: true },
    { date: nthMonday(year, 2, 3), name: 'Family Day' },
    { date: addDays(easter(year), -2), name: 'Good Friday' },
    { date: victoriaDay(year), name: 'Victoria Day' },
    { date: ymd(year, 7, 1), name: 'Canada Day', fixed: true },
    { date: nthMonday(year, 8, 1), name: bc ? 'BC Day' : 'Civic Holiday' },
    { date: nthMonday(year, 9, 1), name: 'Labour Day' },
    ...(bc ? [{ date: ymd(year, 9, 30), name: 'National Day for Truth and Reconciliation', fixed: true }] : []),
    { date: nthMonday(year, 10, 2), name: 'Thanksgiving' },
    ...(bc ? [{ date: ymd(year, 11, 11), name: 'Remembrance Day', fixed: true }] : []),
    { date: ymd(year, 12, 25), name: 'Christmas Day', fixed: true },
    ...(bc ? [] : [{ date: ymd(year, 12, 26), name: 'Boxing Day', fixed: true }]),
  ];
  const taken = new Set(list.map((h) => h.date));
  const isWeekend = (d) => weekdayOf(d) === 0 || weekdayOf(d) === 6;
  for (const h of list) {
    if (!h.fixed || !isWeekend(h.date)) continue;
    let o = addDays(h.date, 1);
    while (isWeekend(o) || taken.has(o)) o = addDays(o, 1);
    taken.add(o);
    h.observed = o;
  }
  return list.map(({ date, name, observed }) => (observed ? { date, name, observed } : { date, name }));
}

const holidayCache = new Map();

/** Map of closed date -> holiday name for a province and year (observed weekdays included). */
function holidayMap(province, year) {
  const key = `${province}|${year}`;
  if (!holidayCache.has(key)) {
    const m = new Map();
    for (const h of statutoryHolidays(province, year)) {
      m.set(h.date, h.name);
      if (h.observed) m.set(h.observed, `${h.name} (observed)`);
    }
    holidayCache.set(key, m);
  }
  return holidayCache.get(key);
}

/**
 * Why a date is closed, or null if it is not.
 * @param {string} date 'YYYY-MM-DD'
 * @param {{province?: string, closures?: {from: string, to: string, label?: string}[]}} settings
 */
export function closedReason(date, settings = {}) {
  const year = Number(date.slice(0, 4));
  const holiday = holidayMap(settings.province ?? 'none', year).get(date);
  if (holiday) return holiday;
  for (const c of settings.closures ?? []) {
    if (date >= c.from && date <= c.to) return c.label || 'Clinic closure';
  }
  return null;
}

export const isClosed = (date, settings) => closedReason(date, settings) !== null;

const LINE = /^(\d{4}-\d{2}-\d{2})(?:\s+(?:to|-)\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(.*))?$/;
const MAX_CLOSURES = 200;
const MAX_RANGE_DAYS = 366;

/** Turn one closure into a clean { from, to, label }, or throw RangeError. */
function cleanClosure(c) {
  const from = String(c?.from ?? '');
  const to = String(c?.to || from);
  if (!isValidDate(from) || !isValidDate(to)) throw new RangeError(`Closure date is not valid: ${from}${to !== from ? ` to ${to}` : ''}`);
  if (to < from) throw new RangeError(`Closure range ends before it starts: ${from} to ${to}`);
  let span = 0;
  for (let d = from; d < to && span <= MAX_RANGE_DAYS; d = addDays(d, 1)) span += 1;
  if (span > MAX_RANGE_DAYS) throw new RangeError('A closure range can be at most one year');
  return { from, to, label: String(c?.label ?? '').trim().slice(0, 80) };
}

/** Accepts an array of closures or the settings page text (one per line) and returns a clean array. */
export function parseClosures(input) {
  let items = input;
  if (typeof input === 'string') {
    items = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const m = LINE.exec(line);
      if (!m) throw new RangeError(`Could not read the closure line "${line.slice(0, 60)}". Use 2026-12-24 or 2026-12-24 to 2026-12-27 followed by an optional name`);
      return { from: m[1], to: m[2] ?? m[1], label: m[3] ?? '' };
    });
  }
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new RangeError('Closures must be a list');
  if (items.length > MAX_CLOSURES) throw new RangeError(`At most ${MAX_CLOSURES} closures`);
  return items.map(cleanClosure).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** The closures as the settings page text. */
export function closuresToText(closures = []) {
  return closures.map((c) => `${c.from}${c.to !== c.from ? ` to ${c.to}` : ''}${c.label ? ` ${c.label}` : ''}`).join('\n');
}
