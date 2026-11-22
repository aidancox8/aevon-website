// Task text -> follow-up timeframe. Returns { weeks|days|date, minutes, mode, confidence }
// or { unclear: true, why }. Pure: no clock, the caller passes today as 'YYYY-MM-DD'.
import { addDays, isValidDate } from './time.js';

const WORDS = {
  zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20,
  thirty: 30, forty: 40, sixty: 60, ninety: 90,
};
const NUM = `(\\d{1,3}|${Object.keys(WORDS).join('|')})`;
const UNIT = '(days?|d|weeks?|wks?|w|months?|mos?|mths?|years?|yrs?|y)';
const RELATIVE = new RegExp(`\\b(?:a\\s+couple\\s+of\\s+()|${NUM}(?:\\s*(?:-|to)\\s*${NUM})?\\s*)${UNIT}\\b`);
const MINUTES = /\b(\d{1,3})\s*(?:min(?:ute)?s?)\b/;
const HOURS = /\b(\d{1,2}(?:\.5)?)\s*(?:hours?|hrs?)\b/;
const FOLLOW_UP = /\b(follow[\s-]?up|f\/u|f-u|fu|rtc|review|recheck|re-check|see\s+(?:in|again|back|pt|patient)|revisit|re-visit|return|book|appt|appointment|visit)\b/;
// Clinical shorthand: 6/52 is six weeks, 3/12 three months, 2/7 two days. Not a date: a third number after it rules it out.
const FRACTION = /(?<![\d/.])(\d{1,2})\/(52|12|7)(?![\d/])/;
const SHORT_MONTHS = /\b(\d{1,2})m\b/;
const NEXT = /\bnext\s+(week|month)\b/;
const IMMEDIATE = /\b(tomorrow|today|tonight|this\s+week|in\s+a\s+few\s+days)\b/;
// Anything marked urgent is never handled by the agent, whatever else the task says.
const URGENT = /\b(urgent(?:ly)?|stat|asap|a\.s\.a\.p\.?|emergent|emergency|immediately|right\s+away)\b/;
const NEGATED = /\b(?:no|not|don'?t|do\s+not|without)\s+(?:need\s+(?:a\s+)?|to\s+)?(?:follow|f\/u|fu\b|book|re-?check)/;

const MONTH_NUM = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH_RE = Object.keys(MONTH_NUM).sort((a, b) => b.length - a.length).join('|');
const DATE_MD = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`);
const DATE_DM = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:,?\\s*(\\d{4}))?\\b`);
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;

const num = (token) => (/^\d+$/.test(token) ? Number(token) : WORDS[token]);

function unclear(why, reason) {
  return reason ? { unclear: true, why, reason } : { unclear: true, why };
}

const MONTH_DAYS = 30.44;

function readMinutes(text) {
  const m = MINUTES.exec(text);
  if (m) return { minutes: Number(m[1]), rest: text.replace(m[0], ' ') };
  const h = HOURS.exec(text);
  if (h) return { minutes: Math.round(Number(h[1]) * 60), rest: text.replace(h[0], ' ') };
  if (/\bhalf\s+(?:an\s+)?hour\b/.test(text)) return { minutes: 30, rest: text.replace(/\bhalf\s+(?:an\s+)?hour\b/, ' ') };
  return { minutes: null, rest: text };
}

function readMode(text) {
  if (/\b(phone|telephone|tele-?visit|telehealth|virtual)\b/.test(text)) return 'phone';
  if (/\b(in[\s-]?person|in[\s-]?office|in[\s-]?clinic)\b/.test(text)) return 'in-person';
  return null;
}

function readDate(text, today) {
  let y; let mo; let d;
  let m = DATE_ISO.exec(text);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = DATE_MD.exec(text))) [mo, d, y] = [MONTH_NUM[m[1]], Number(m[2]), m[3] ? Number(m[3]) : null];
  else if ((m = DATE_DM.exec(text))) [d, mo, y] = [Number(m[1]), MONTH_NUM[m[2]], m[3] ? Number(m[3]) : null];
  else return null;
  const pad = (n) => String(n).padStart(2, '0');
  const explicitYear = y !== null;
  const year = explicitYear ? y : Number(today.slice(0, 4));
  let date = `${year}-${pad(mo)}-${pad(d)}`;
  if (!isValidDate(date)) return { bad: true };
  if (!explicitYear && date < today) {
    date = `${year + 1}-${pad(mo)}-${pad(d)}`;
    if (!isValidDate(date)) return { bad: true };
  }
  if (date <= today) return { past: true };
  return { date };
}

/**
 * @param {string} text  the task message written by the doctor
 * @param {{today: string, priority?: string|null}} ctx  clinic-local date, 'YYYY-MM-DD'; the task's priority field if the EMR has one
 * @returns a timeframe, or { unclear: true, why, reason? } where `reason` is the full hand-back note when the cause is not a reading problem
 */
export function parseTask(text, { today, priority = null }) {
  const raw = String(text ?? '').slice(0, 500).toLowerCase().replace(/[–—]/g, '-').trim();
  if (!raw) return unclear('Task text is empty');
  if (URGENT.test(raw) || URGENT.test(String(priority ?? '').toLowerCase())) {
    return unclear('Marked urgent', 'Marked urgent. The agent does not handle urgent follow-ups: please book this one by phone');
  }
  if (NEGATED.test(raw)) return unclear('Task says no follow-up is needed');
  const fraction = FRACTION.exec(raw);
  if (!fraction && !FOLLOW_UP.test(raw)) return unclear('No follow-up request found');

  const { minutes, rest } = readMinutes(raw);
  if (minutes !== null && (minutes < 5 || minutes > 120)) return unclear('Visit length is not sensible');
  const mode = readMode(raw);

  if (fraction) {
    const n = Number(fraction[1]);
    const out = { minutes, mode, confidence: 'high' };
    if (fraction[2] === '52') out.weeks = n;
    else if (fraction[2] === '7') out.days = n;
    else out.days = Math.round(n * MONTH_DAYS);
    return n >= 1 ? out : unclear('Timeframe is zero');
  }
  const shortMonths = SHORT_MONTHS.exec(rest);
  if (shortMonths && !RELATIVE.test(rest)) {
    const n = Number(shortMonths[1]);
    return n >= 1 ? { days: Math.round(n * MONTH_DAYS), minutes, mode, confidence: 'high' } : unclear('Timeframe is zero');
  }

  const rel = RELATIVE.exec(rest);
  if (!rel) {
    const next = NEXT.exec(rest);
    if (next) return next[1] === 'week' ? { weeks: 1, minutes, mode, confidence: 'high' } : { days: 30, minutes, mode, confidence: 'high' };
    const soon = IMMEDIATE.exec(rest);
    if (soon) return { days: soon[1] === 'tomorrow' ? 1 : 0, minutes, mode, confidence: 'high', immediate: true };
  }
  if (rel) {
    const couple = rel[1] !== undefined && rel[2] === undefined && /couple/.test(rel[0]);
    const lo = couple ? 2 : num(rel[2]);
    const hi = rel[3] !== undefined ? num(rel[3]) : null;
    const n = hi === null ? lo : Math.min(lo, hi);
    const unit = rel[4][0] === 'm' ? 'month' : rel[4][0];
    if (!(n >= 1)) return unclear('Timeframe is zero');
    const confidence = hi === null && !couple ? 'high' : 'medium';
    const out = { minutes, mode, confidence };
    if (unit === 'w') out.weeks = n;
    else if (unit === 'd') out.days = n;
    else if (unit === 'month') out.days = Math.round(n * MONTH_DAYS);
    else out.days = n * 365;
    if ((out.weeks ?? 0) > 104 || (out.days ?? 0) > 730) return unclear('Timeframe is too long to book');
    return out;
  }

  const dated = readDate(rest, today);
  if (dated?.bad) return unclear('Date is not valid');
  if (dated?.past) return unclear('Date is not in the future');
  if (dated) return { date: dated.date, minutes, mode, confidence: 'high' };
  return unclear('Could not read the timeframe');
}

/** Clinic-local target date for a parsed task. */
export function targetDate(parsed, today) {
  if (parsed.date) return parsed.date;
  if (parsed.weeks) return addDays(today, parsed.weeks * 7);
  return addDays(today, parsed.days);
}
