// Slot selection: three offers on three different days where possible, mixing morning and
// afternoon, nearest the target date. Deterministic: the same inputs give the same offers.
import { addDays, daysBetween, localDate, localToMs, localMinutes, toIso, weekdayOf } from './time.js';
import { isClosed } from './closures.js';

const STEP_MINUTES = 15;

/**
 * Constraints: { partOfDay?: 'morning'|'afternoon', weekdays?: number[] (0 = Sunday),
 *   notBefore?: 'YYYY-MM-DD', notAfter?: 'YYYY-MM-DD', mode?, avoid?: [{from, to}] }
 */
export function allowedByConstraints(date, minuteOfDay, c) {
  if (c.partOfDay === 'morning' && minuteOfDay >= 720) return false;
  if (c.partOfDay === 'afternoon' && minuteOfDay < 720) return false;
  if (c.weekdays?.length && !c.weekdays.includes(weekdayOf(date))) return false;
  if (c.notBefore && date < c.notBefore) return false;
  if (c.notAfter && date > c.notAfter) return false;
  if (c.avoid?.some((r) => date >= r.from && date <= r.to)) return false;
  return true;
}

function overlaps(startMs, endMs, appointments) {
  return appointments.some((a) => Date.parse(a.start) < endMs && Date.parse(a.end) > startMs);
}

/** True if [start, start + minutes) sits inside one working block and clashes with no appointment. */
export function slotIsFree({ blocks, appointments, start, minutes }) {
  const s = Date.parse(start);
  const e = s + minutes * 60000;
  const inBlock = blocks.some((b) => Date.parse(b.start) <= s && e <= Date.parse(b.end));
  return inBlock && !overlaps(s, e, appointments);
}

function dayCandidates({ date, blocks, appointments, minutes, tz, constraints }) {
  const out = [];
  for (const b of blocks) {
    const bs = Date.parse(b.start);
    const be = Date.parse(b.end);
    for (let s = bs; s + minutes * 60000 <= be; s += STEP_MINUTES * 60000) {
      const e = s + minutes * 60000;
      if (overlaps(s, e, appointments)) continue;
      const minuteOfDay = localMinutes(s, tz);
      if (!allowedByConstraints(date, minuteOfDay, constraints)) continue;
      out.push({ start: toIso(s, tz), end: toIso(e, tz), date, part: minuteOfDay < 720 ? 'morning' : 'afternoon', minutes });
    }
  }
  return out;
}

function chooseThree(cands, target) {
  const byDate = new Map();
  for (const c of cands) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push(c);
  }
  const dist = (d) => Math.abs(daysBetween(target, d));
  // nearest first; on a tie prefer the later date so we never go earlier than the doctor asked
  const dates = [...byDate.keys()].sort((a, b) => dist(a) - dist(b) || (a < b ? 1 : -1));
  const firstOf = (list, part) => list.find((c) => c.part === part) ?? list[0];

  const picks = dates.slice(0, 3).map((d, i) => firstOf(byDate.get(d), i % 2 === 0 ? 'morning' : 'afternoon'));

  if (picks.length === 3 && picks.every((p) => p.part === picks[0].part)) {
    const keep = new Set(picks.slice(0, 2).map((p) => p.date));
    const other = picks[0].part === 'morning' ? 'afternoon' : 'morning';
    const swap = dates.find((d) => !keep.has(d) && byDate.get(d).some((c) => c.part === other));
    if (swap) picks[2] = byDate.get(swap).find((c) => c.part === other);
  }

  if (picks.length < 3) {
    const used = new Set(picks.map((p) => p.start));
    const spare = cands
      .filter((c) => !used.has(c.start))
      .sort((a, b) => dist(a.date) - dist(b.date) || (a.start < b.start ? -1 : 1));
    for (const c of spare) {
      if (picks.length === 3) break;
      const sameDayPartTaken = picks.some((p) => p.date === c.date && p.part === c.part);
      if (!sameDayPartTaken) picks.push(c);
    }
    for (const c of spare) {
      if (picks.length === 3) break;
      if (!picks.includes(c)) picks.push(c);
    }
  }
  return picks.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * Find up to three offers. Closed days (statutory holidays for the clinic's province, clinic closures) are never offered,
 * whatever the EMR template says. Every offer satisfies the constraints.
 * @param {{emr, providerId: string, target: string, minutes: number, constraints?: object,
 *   settings: {timeZone: string, windowBeforeDays: number, windowAfterDays: number, province?: string, closures?: object[]},
 *   nowMs: number, exclude?: string[]}} o
 * @returns {Promise<{start: string, end: string, date: string, part: string, minutes: number}[]>}
 */
export async function findOffers({ emr, providerId, target, minutes, constraints = {}, settings, nowMs, exclude = [] }) {
  const tz = settings.timeZone;
  const tomorrow = addDays(localDate(nowMs, tz), 1);
  let from = addDays(target, -settings.windowBeforeDays);
  let to = addDays(target, settings.windowAfterDays);
  if (from < tomorrow) from = tomorrow;
  if (constraints.notBefore && constraints.notBefore > from) from = constraints.notBefore;
  if (constraints.notAfter && constraints.notAfter < to) to = constraints.notAfter;
  if (from > to) return [];

  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const [templates, appointments] = await Promise.all([
    Promise.all(dates.map((date) => (isClosed(date, settings) ? [] : emr.getDayTemplate({ providerId, date })))),
    emr.getAppointments({
      providerId,
      from: toIso(localToMs(from, '00:00', tz), tz),
      to: toIso(localToMs(addDays(to, 1), '00:00', tz), tz),
    }),
  ]);

  const skip = new Set(exclude.map((s) => Date.parse(s)));
  const cands = dates
    .flatMap((date, i) => dayCandidates({ date, blocks: templates[i], appointments, minutes, tz, constraints }))
    .filter((c) => !skip.has(Date.parse(c.start)))
    .filter((c) => allowedByConstraints(c.date, localMinutes(Date.parse(c.start), tz), constraints));
  return chooseThree(cands, target);
}
