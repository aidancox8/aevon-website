// Time zone helpers. Instants are epoch milliseconds; local dates are 'YYYY-MM-DD'.
const dtfCache = new Map();

function formatter(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }
  return dtfCache.get(tz);
}

/** Local calendar parts of an instant in a time zone. */
export function partsOf(ms, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = Number(value);
  const wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, weekday: wd };
}

function offsetMinutes(ms, tz) {
  const p = partsOf(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

/** Instant for a local date and time in a time zone. */
export function localToMs(date, hhmm, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - offsetMinutes(guess, tz) * 60000;
  const second = offsetMinutes(ms, tz);
  if (second !== offsetMinutes(guess, tz)) ms = guess - second * 60000;
  return ms;
}

const pad = (n) => String(n).padStart(2, '0');

/** ISO 8601 string with the zone offset, for example 2027-01-12T09:15:00-05:00. */
export function toIso(ms, tz) {
  const p = partsOf(ms, tz);
  const off = offsetMinutes(ms, tz);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function localDate(ms, tz) {
  const p = partsOf(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function localMinutes(ms, tz) {
  const p = partsOf(ms, tz);
  return p.h * 60 + p.mi;
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

export function daysBetween(a, b) {
  const ms = (s) => Date.UTC(...s.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function mondayOf(date) {
  const wd = weekdayOf(date);
  return addDays(date, -((wd + 6) % 7));
}

export function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local parts read straight from an ISO string that already carries the clinic offset. */
function isoParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return { date: `${m[1]}-${m[2]}-${m[3]}`, y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

/** Short patient-facing form: "Tue Jan 12 9:15am". */
export function friendly(iso) {
  const p = isoParts(iso);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const min = p.mi === 0 ? '' : `:${pad(p.mi)}`;
  return `${DAYS[weekdayOf(p.date)]} ${MONTHS[p.mo - 1]} ${p.d} ${h12}${min}${p.h < 12 ? 'am' : 'pm'}`;
}

/** Full patient-facing form for sentences: "Tue Jan 12 at 9:15am" (minutes always shown). */
export function friendlyAt(iso) {
  const p = isoParts(iso);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${DAYS[weekdayOf(p.date)]} ${MONTHS[p.mo - 1]} ${p.d} at ${h12}:${pad(p.mi)}${p.h < 12 ? 'am' : 'pm'}`;
}

/** Task note form: "Tue 12 Jan 09:15". */
export function noteStamp(iso) {
  const p = isoParts(iso);
  return `${DAYS[weekdayOf(p.date)]} ${p.d} ${MONTHS[p.mo - 1]} ${pad(p.h)}:${pad(p.mi)}`;
}

export function isoDate(iso) {
  return isoParts(iso).date;
}

export const MONTH_NAMES = MONTHS;

/** "Fri 9:00am" for a moment within the next six days, "Fri Dec 4 9:00am" further out. nowMs is the current instant. */
export function shortWhen(ms, tz, nowMs) {
  const iso = toIso(ms, tz);
  const full = friendlyAt(iso).replace(' at ', ' ');
  const soon = ms - nowMs < 6 * 86400000 && ms >= nowMs - 86400000;
  return soon ? `${full.slice(0, 3)} ${full.split(' ').at(-1)}` : full;
}
