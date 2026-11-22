// Free-text scheduling phrases -> constraints for slots.js. Rules only, no model.
//   "mornings only", "not that week", "anything after the 20th", "before Christmas",
//   "Tuesdays or Thursdays", "later that day", "next week instead", "can it be a phone call"
import { normalise } from './text.js';
import { addDays, addMonths, isValidDate, mondayOf } from './time.js';

const DAY_FORMS = {
  0: ['sunday', 'sundays', 'sun'],
  1: ['monday', 'mondays', 'mon'],
  2: ['tuesday', 'tuesdays', 'tue', 'tues'],
  3: ['wednesday', 'wednesdays', 'wed', 'weds'],
  4: ['thursday', 'thursdays', 'thu', 'thur', 'thurs'],
  5: ['friday', 'fridays', 'fri'],
  6: ['saturday', 'saturdays', 'sat'],
};
const DAY_OF = new Map(Object.entries(DAY_FORMS).flatMap(([d, forms]) => forms.map((f) => [f, Number(d)])));
const NEGATORS = new Set(['not', 'no', 'except', 'but', 'cant', "can't", 'never', 'avoid', 'excluding', 'without', "don't", 'dont']);
const CONNECTORS = new Set(['or', 'and', 'on', 'the', 'a', 'any', 'day', 'days', 'nor', 'neither']);

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

// Date expressions. Each pattern is tried in order; the capture groups differ so each has a reader.
const DATE_EXPRS = [
  { re: `(?:${MON}) \\d{1,2}(?:st|nd|rd|th)?`, read: (s) => md(s) },
  { re: `\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:${MON})`, read: (s) => dm(s) },
  { re: 'christmas(?: day| eve)?|xmas', read: (s, ref) => holiday(s.includes('eve') ? 24 : 25, 12, ref) },
  { re: 'boxing day', read: (s, ref) => holiday(26, 12, ref) },
  { re: 'new years?(?: day| eve)?', read: (s, ref) => newYear(s, ref) },
  { re: '(?:the )?\\d{1,2}(?:st|nd|rd|th)', read: (s, ref) => dayOfMonth(s, ref) },
  { re: 'the \\d{1,2}', read: (s, ref) => dayOfMonth(s, ref) },
];
const DATE_RE = DATE_EXPRS.map((e) => `(?:${e.re})`).join('|');

// kind: how the date bounds the offers. after/before are exclusive, the others inclusive.
const BOUND_KINDS = [
  { re: 'not before|no earlier than|not until|on or after|from|starting|beginning', kind: 'notBefore' },
  { re: 'not after|no later than|on or before|up to|by|until|till', kind: 'notAfter' },
  { re: 'after|following|past|beyond', kind: 'after' },
  { re: 'before|prior to', kind: 'before' },
];
const BOUND_RE = new RegExp(`\\b(${BOUND_KINDS.map((k) => `(?:${k.re})`).join('|')}) (?:any ?time |anything )?(${DATE_RE})\\b`, 'g');

const pad = (n) => String(n).padStart(2, '0');
const num = (s) => Number(/\d+/.exec(s)[0]);

function monthOf(s) {
  return MONTHS[new RegExp(`(${MON})`).exec(s)[1]];
}

function resolveMonthDay(month, day, ref) {
  const year = Number(ref.slice(0, 4));
  let date = `${year}-${pad(month)}-${pad(day)}`;
  if (!isValidDate(date)) return null;
  if (date < addDays(ref, -60)) date = `${year + 1}-${pad(month)}-${pad(day)}`;
  return isValidDate(date) ? date : null;
}

const md = (s) => ({ month: monthOf(s), day: num(s.replace(new RegExp(`(${MON})`), '')) });
const dm = (s) => ({ month: monthOf(s), day: num(s) });
const holiday = (day, month, ref) => ({ month, day, ref });
const newYear = (s, ref) => (s.includes('eve') ? { month: 12, day: 31, ref } : { month: 1, day: 1, ref });
const dayOfMonth = (s, ref) => ({ month: Number(ref.slice(5, 7)), day: num(s), ref });

function readDate(expr, ref) {
  for (const e of DATE_EXPRS) {
    if (!new RegExp(`^(?:${e.re})$`).test(expr)) continue;
    const r = e.read(expr, ref);
    return resolveMonthDay(r.month, r.day, ref);
  }
  return null;
}

function weekdays(tokens) {
  const included = new Set();
  const excluded = new Set();
  let neg = false;
  for (const t of tokens) {
    if (NEGATORS.has(t)) neg = true;
    else if (DAY_OF.has(t)) (neg ? excluded : included).add(DAY_OF.get(t));
    else if (!CONNECTORS.has(t)) neg = false;
  }
  if (included.size) return [...included].filter((d) => !excluded.has(d)).sort();
  if (excluded.size) return [0, 1, 2, 3, 4, 5, 6].filter((d) => !excluded.has(d));
  return null;
}

function partOfDay(n) {
  const noMorning = /\b(?:not|no|never|cant|can't|avoid|except|without)\s+(?:do\s+)?(?:any\s+|the\s+)?mornings?\b/.test(n);
  const noAfternoon = /\b(?:not|no|never|cant|can't|avoid|except|without)\s+(?:do\s+)?(?:any\s+|the\s+)?afternoons?\b/.test(n);
  const morning = /\bmornings?\b|\bbefore (?:noon|lunch|12)\b|\bam only\b|\b\d{1,2}(?::\d\d)? ?am\b/.test(n);
  const afternoon = /\bafternoons?\b|\bafter (?:noon|lunch|work)\b|\bpm only\b|\b\d{1,2}(?::\d\d)? ?pm\b|\blater (?:that|in the) day\b|\bend of (?:the )?day\b/.test(n);
  if (noMorning && !noAfternoon) return 'afternoon';
  if (noAfternoon && !noMorning) return 'morning';
  if (noMorning || noAfternoon) return null;
  if (morning && !afternoon) return 'morning';
  if (afternoon && !morning) return 'afternoon';
  return null;
}

function mode(n) {
  if (/\b(?:phone|telephone|tele ?visit|virtual)\b/.test(n)) return 'phone';
  if (/\bin ?person\b|\bin the office\b|\bin office\b|\bcome in\b|\bin clinic\b/.test(n)) return 'in-person';
  return null;
}

function dateBounds(n, ref, out) {
  for (const m of n.matchAll(BOUND_RE)) {
    const kind = BOUND_KINDS.find((k) => new RegExp(`^(?:${k.re})$`).test(m[1])).kind;
    const date = readDate(m[2], ref);
    if (!date) continue;
    if (kind === 'notBefore') out.notBefore = date;
    else if (kind === 'notAfter') out.notAfter = date;
    else if (kind === 'after') out.notBefore = addDays(date, 1);
    else out.notAfter = addDays(date, -1);
  }
  const inMonth = new RegExp(`\\b(?:in|during|sometime in) (${MON})\\b(?! \\d)`).exec(n);
  if (inMonth && !out.notBefore && !out.notAfter) {
    const month = MONTHS[inMonth[1]];
    const start = resolveMonthDay(month, 1, ref);
    if (start) {
      out.notBefore = start;
      out.notAfter = addDays(addMonths(start.slice(0, 8) + '01', 1), -1);
    }
  }
}

function relativeToOffers(n, offers, out) {
  if (!offers.length) return;
  const first = offers[0].date ?? offers[0].start.slice(0, 10);
  const last = offers[offers.length - 1].date ?? offers[offers.length - 1].start.slice(0, 10);
  if (/\b(?:not that week|not those weeks?|different week|another week|other week)\b/.test(n)) {
    out.avoid = [{ from: mondayOf(first), to: addDays(mondayOf(last), 6) }];
  } else if (/\b(?:next week|week after|following week)\b/.test(n)) {
    const monday = addDays(mondayOf(first), 7);
    out.notBefore = monday;
    out.notAfter = addDays(monday, 6);
  }
  if (/\b(?:sooner|earlier)\b(?! in the day)|\btoo far\b/.test(n)) out.notAfter = addDays(first, -1);
  else if (/\b(?:further out|a bit later|later)\b(?! (?:that|in the) day)|\btoo soon\b/.test(n)) out.notBefore = addDays(last, 1);
}

/**
 * @param {string} text
 * @param {{offers?: {date?: string, start: string}[], today: string}} ctx
 * @returns {object} constraints; empty when nothing was found
 */
export function parseConstraints(text, { offers = [], today }) {
  const n = normalise(text);
  const ref = offers[0]?.date ?? offers[0]?.start?.slice(0, 10) ?? today;
  const out = {};
  const part = partOfDay(n);
  if (part) out.partOfDay = part;
  const days = weekdays(n.split(' '));
  if (days?.length) out.weekdays = days;
  const m = mode(n);
  if (m) out.mode = m;
  dateBounds(n, ref, out);
  relativeToOffers(n, offers, out);
  return out;
}

/** Merge a new set of constraints over an earlier one (the patient's latest word wins). */
export function mergeConstraints(old, add) {
  const merged = { ...old, ...add };
  if (old?.avoid || add?.avoid) merged.avoid = [...(old?.avoid ?? []), ...(add?.avoid ?? [])];
  return merged;
}
