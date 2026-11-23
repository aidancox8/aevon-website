// Clinic settings in SQLite. Defaults come from config; the settings page overrides them.
import { PROVINCES, parseClosures } from '../core/closures.js';

const MODES = ['in-person', 'phone'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const intIn = (label, min, max) => (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new RangeError(`${label} must be a whole number from ${min} to ${max}`);
  return n;
};
const text = (label, max = 80) => (v) => {
  const s = String(v ?? '').trim();
  if (!s || s.length > max) throw new RangeError(`${label} must be 1 to ${max} characters`);
  return s;
};
const hhmm = (label) => (v) => {
  if (!HHMM.test(String(v))) throw new RangeError(`${label} must look like 08:00`);
  return String(v);
};

const PHONE = /^[0-9 ()+.\-]{7,24}$/;
const phone = (v) => {
  const s = String(v ?? '').trim();
  if (s && (!PHONE.test(s) || s.replace(/\D/g, '').length < 7)) throw new RangeError('Clinic phone number must look like 604-555-0100');
  return s;
};

const FIELDS = {
  clinicName: text('Clinic name'),
  timeZone: (v) => {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: String(v) });
    } catch {
      throw new RangeError('Time zone is not recognised');
    }
    return String(v);
  },
  contactStart: hhmm('Contact hours start'),
  contactEnd: hhmm('Contact hours end'),
  windowBeforeDays: intIn('Window before', 0, 60),
  windowAfterDays: intIn('Window after', 0, 120),
  defaultMinutes: intIn('Default visit length', 5, 120),
  allowedModes: (v) => {
    const list = (Array.isArray(v) ? v : [v]).filter(Boolean);
    if (!list.length || !list.every((m) => MODES.includes(m))) throw new RangeError('Allowed visit modes must be in-person and/or phone');
    return [...new Set(list)];
  },
  nudgeHours1: intIn('First nudge hours', 1, 720),
  nudgeHours2: intIn('Second nudge hours', 1, 720),
  giveUpHours: intIn('Hand back hours', 1, 1440),
  frontDeskUserId: text('Front desk user id', 60),
  agentUserId: text('Agent user id', 60),
  clinicPhone: phone,
  province: (v) => {
    const p = v === undefined || v === '' ? 'none' : String(v);
    if (!Object.hasOwn(PROVINCES, p)) throw new RangeError(`Province must be one of ${Object.keys(PROVINCES).join(', ')}`);
    return p;
  },
  closures: (v) => parseClosures(v),
  maxNewTimeRounds: (v) => intIn('Rounds of new times', 1, 6)(v === undefined || v === '' ? 2 : v),
  // Repeat the chosen time back and book only after the patient says yes. Off unless a clinic turns it on:
  // the confirmation already says "Reply CHANGE if you need a different time".
  confirmBeforeBooking: (v) => (v === undefined || v === '' ? false : v === true || v === 'true' || v === 'on' || v === 1),
  minLeadDays: (v) => intIn('Minimum lead time in days', 0, 60)(v === undefined || v === '' ? 3 : v),
};

export const SETTING_KEYS = Object.keys(FIELDS);

export function validateSettings(candidate) {
  const out = {};
  for (const [key, check] of Object.entries(FIELDS)) out[key] = check(candidate[key]);
  if (out.contactStart >= out.contactEnd) throw new RangeError('Contact hours start must be before end');
  if (out.nudgeHours1 >= out.nudgeHours2 || out.nudgeHours2 >= out.giveUpHours) {
    throw new RangeError('Nudge hours must increase: first nudge, second nudge, hand back');
  }
  return out;
}

export function createSettings(db, defaults) {
  const base = validateSettings(defaults);
  return {
    get() {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('clinic');
      return row ? { ...base, ...JSON.parse(row.value) } : { ...base };
    },
    /** Validates the whole object and stores it. Returns { before, after }. */
    save(patch) {
      const before = this.get();
      const after = validateSettings({ ...before, ...patch });
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run('clinic', JSON.stringify(after));
      return { before, after };
    },
  };
}
