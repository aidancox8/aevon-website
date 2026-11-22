// The pretend clinic behind the demo page: one doctor, four invented patients and a schedule that
// already has other patients in it, wired to the same engine the product runs. Held in memory only.
import { openDb } from './db.js';
import { createSettings } from './store/settings.js';
import { createConsent, createAudit, createMessages, createTasks } from './store/memory.js';
import { createSimSms } from './channels/simSms.js';
import { createEngine } from './core/engine.js';
import { createClock } from './core/clock.js';
import { FakeEmr } from './emr/fake.js';
import { closedReason } from './core/closures.js';
import { describeTask } from './core/status.js';
import { addDays, localDate, localToMs, mondayOf, toIso, weekdayOf } from './core/time.js';

export const TZ = 'America/Vancouver';
export const DOCTOR = { id: 'dr-hale', displayName: 'Dr. Hale' };
export const PATIENTS = [
  { id: 'p1', firstName: 'Priya', lastName: 'Nair', mobile: '604-555-0131', sms: true },
  { id: 'p2', firstName: 'Marcus', lastName: 'Bell', mobile: '604-555-0178', sms: true },
  { id: 'p3', firstName: 'Helen', lastName: 'Park', mobile: '604-555-0164', sms: true },
  { id: 'p4', firstName: 'Tom', lastName: 'Reyes', mobile: '604-555-0109', sms: false },
];

const CLINIC = {
  clinicName: 'Rosewood Clinic', timeZone: TZ, contactStart: '08:00', contactEnd: '20:00',
  windowBeforeDays: 7, windowAfterDays: 14, defaultMinutes: 15, allowedModes: ['in-person', 'phone'],
  nudgeHours1: 24, nudgeHours2: 72, giveUpHours: 120, frontDeskUserId: 'frontdesk', agentUserId: 'aevon',
  clinicPhone: '', province: 'BC', closures: [], minLeadDays: 3,
};
export const BLOCKS = [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '16:30' }];
const OTHERS = [
  'Adams, R', 'Baker, J', 'Chan, M', 'Dhillon, S', 'Evans, T', 'Fraser, L', 'Gill, K', 'Hughes, P', 'Ito, N', 'Jensen, A',
  'Kaur, H', 'Lam, D', 'Martin, C', 'Novak, E', 'Olsen, B', 'Patel, V', 'Quan, W', 'Roy, G', 'Singh, A', 'Turner, F',
  'Ueda, Y', 'Vance, I', 'Wong, S', 'Young, O',
];
const HOUR = 3600000;

/** Small repeatable hash so the same day always has the same appointments in it. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function createClinic() {
  const today = localDate(Date.now(), TZ);
  // The clinic's clock starts at ten in the morning today, so a text is never held back by quiet hours.
  const clock = createClock({ fixed: localToMs(today, '10:00', TZ) });
  const db = openDb();
  const settings = createSettings(db, CLINIC);
  const stores = { consent: createConsent(db, clock), audit: createAudit(db, clock), messages: createMessages(db, clock), tasks: createTasks(db, clock) };
  const emr = new FakeEmr({ clock, timeZone: TZ, agentUserId: CLINIC.agentUserId });
  emr.addProvider(DOCTOR);
  emr.setWeeklyTemplate(DOCTOR.id, { 1: BLOCKS, 2: BLOCKS, 3: BLOCKS, 4: BLOCKS, 5: BLOCKS });
  const names = new Map(); // appointment id -> name shown in the schedule
  for (const p of PATIENTS) {
    emr.addPatient({ id: p.id, firstName: p.firstName, lastName: p.lastName, mobile: p.mobile, email: null });
    stores.consent.set({ patientId: p.id, sms: p.sms, email: false, recordedBy: 'front desk', sourceNote: p.sms ? 'Agreed to texts at check-in' : 'Nothing on file' });
  }
  const engine = createEngine({ emr, db, stores, channels: { sms: createSimSms() }, settings, clock, llm: null, logger: { error() {} } });

  // Other patients' appointments, filled in for each day the first time anything looks at it.
  const seeded = new Set();
  function seedDay(date) {
    if (seeded.has(date)) return;
    seeded.add(date);
    const wd = weekdayOf(date);
    if (wd === 0 || wd === 6 || closedReason(date, settings.get())) return;
    for (const b of BLOCKS) {
      for (let m = minutesOf(b.start); m + 15 <= minutesOf(b.end); m += 15) {
        const r = hash(`${date} ${m}`);
        if (r > 0.6) continue;
        const long = r < 0.12 && m + 30 <= minutesOf(b.end);
        const id = emr.addAppointment({ providerId: DOCTOR.id, patientId: 'other', start: toIso(localToMs(date, hhmm(m), TZ), TZ), minutes: long ? 30 : 15 });
        names.set(id, OTHERS[Math.floor(hash(`${date} ${m} n`) * OTHERS.length)]);
        if (long) m += 15;
      }
    }
  }
  function seedRange(from, to) {
    for (let d = from; d <= to; d = addDays(d, 1)) seedDay(d);
  }
  const lookups = ['getDayTemplate', 'getAppointments'];
  for (const name of lookups) {
    const real = emr[name].bind(emr);
    emr[name] = async (q) => {
      if (q.date) seedDay(q.date);
      else seedRange(localDate(Date.parse(q.from), TZ), localDate(Date.parse(q.to), TZ));
      return real(q);
    };
  }

  const patient = (id) => PATIENTS.find((p) => p.id === id);
  const fullName = (p) => `${p.lastName}, ${p.firstName[0]}`;

  /** The doctor saves a task assigned to Aevon. The engine picks it up on its next check, here at once. */
  async function assign(patientId, text) {
    clock.advance(60000);
    const task = emr.createTaskAsDoctor({ patientId, providerId: DOCTOR.id, message: String(text).slice(0, 200) });
    await engine.poll();
    return task.id;
  }

  /** A text from the patient's phone. */
  async function reply(patientId, text) {
    clock.advance(60000);
    const result = await engine.handleInbound({ channel: 'sms', address: patient(patientId).mobile, body: text });
    await engine.poll();
    return result;
  }

  /** Another patient is booked into the first offered time, as a busy front desk would do. */
  function takeFirstOffer(taskId) {
    const row = stores.tasks.get(taskId);
    if (!row || row.state !== 'awaiting' || !row.offers.length) return null;
    const offer = row.offers[0];
    const id = emr.addAppointment({ providerId: DOCTOR.id, patientId: 'other', start: offer.start, minutes: offer.minutes });
    names.set(id, OTHERS[Math.floor(hash(offer.start) * OTHERS.length)]);
    return offer;
  }

  /**
   * Move the clinic's clock to the next thing that happens when the patient stays silent:
   * first reminder, second reminder, then the hand-back. Returns what happened, or null if nothing is waiting.
   */
  async function waitForNext(taskId) {
    const row = stores.tasks.get(taskId);
    if (!row || row.state !== 'awaiting' || !row.first_sent_at) return null;
    const s = settings.get();
    const hours = row.nudges === 0 ? s.nudgeHours1 : row.nudges === 1 ? s.nudgeHours2 : s.giveUpHours;
    const due = row.first_sent_at + hours * HOUR + 60000;
    if (due > clock.now()) clock.advance(due - clock.now());
    await engine.poll();
    const after = stores.tasks.get(taskId);
    return after.state === 'handed_back' ? 'handed_back' : after.nudges > row.nudges ? `reminder ${after.nudges}` : null;
  }

  /** Everything the page draws for one task. */
  function view(taskId) {
    const row = taskId ? stores.tasks.get(taskId) : null;
    if (!row) return null;
    const emrTask = emr.listAllTasks().find((t) => t.id === taskId);
    const s = settings.get();
    return {
      row, emrTask, patient: patient(row.patient_id),
      status: describeTask(row, s, clock.now(), { queued: stores.messages.hasQueued(taskId) }),
      assignee: emrTask.assigneeId === s.agentUserId ? 'Aevon' : 'Front desk',
    };
  }

  /** One week of the doctor's schedule, Monday to Friday, in 15 minute rows. */
  function week(anyDate) {
    const monday = mondayOf(anyDate);
    seedRange(monday, addDays(monday, 4));
    const s = settings.get();
    const appts = emr.listAppointments().filter((a) => a.status !== 'cancelled');
    const days = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(monday, i);
      const closed = closedReason(date, s);
      const slots = new Map();
      for (const a of appts) {
        if (!a.start.startsWith(date)) continue;
        const start = minutesOf(a.start.slice(11, 16));
        const len = Math.round((Date.parse(a.end) - Date.parse(a.start)) / 60000);
        const who = a.patientId === 'other' ? names.get(a.id) : fullName(patient(a.patientId));
        for (let m = start; m < start + len; m += 15) slots.set(m, { who, mine: a.patientId !== 'other', first: m === start, start: a.start });
      }
      days.push({ date, closed: closed || null, slots });
    }
    return { monday, days };
  }

  return {
    today, clock, settings, emr, engine, ...stores, assign, reply, takeFirstOffer, waitForNext, view, week,
    thread: (patientId) => stores.messages.thread(patientId, 'sms').filter((m) => m.direction === 'in' || m.status === 'sent'),
    latestTaskFor: (patientId) => stores.tasks.list().find((t) => t.patient_id === patientId)?.task_id ?? null,
  };
}
