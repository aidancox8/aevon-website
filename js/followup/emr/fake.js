// In-memory EMR for tests and the offline demo. Implements the adapter interface.
// The helper methods at the bottom are for tests and the demo UI only.
import { EmrError } from './adapter.js';
import { toIso, localToMs, localDate, addDays, weekdayOf } from '../core/time.js';

export class FakeEmr {
  constructor({ clock, timeZone = 'America/Toronto', agentUserId = 'agent' } = {}) {
    this.clock = clock ?? { now: () => Date.now() };
    this.tz = timeZone;
    this.agentUserId = agentUserId;
    this.providers = new Map();
    this.patients = new Map();
    this.weekly = new Map(); // providerId -> { weekday: [{start:'HH:MM', end:'HH:MM'}] }
    this.overrides = new Map(); // `${providerId}|${date}` -> blocks
    this.appointments = [];
    this.tasks = new Map();
    this.seq = { task: 0, appt: 0 };
    this.failures = new Map();
    // Test switches. allowOverlap makes createAppointment accept a double booking (as OSCAR does); beforeCreate and
    // afterCreate run inside createAppointment so a test can put another appointment in the gap around ours.
    this.outage = null; // 'UNAVAILABLE' or 'FORBIDDEN': every call fails with that code until set back to null
    this.allowOverlap = false;
    this.beforeCreate = null;
    this.afterCreate = null;
  }

  // ---- interface ----

  describe() {
    return { name: 'fake', version: '1', capabilities: { push: false, cancelAppointment: true } };
  }

  async listAssignedTasks({ assigneeId }) {
    this.#maybeFail('listAssignedTasks');
    return [...this.tasks.values()].filter((t) => t.assigneeId === assigneeId && t.status === 'active').map(clone);
  }

  async getTask(taskId) {
    this.#maybeFail('getTask');
    return clone(this.#task(taskId));
  }

  async getPatient(patientId) {
    this.#maybeFail('getPatient');
    const p = this.patients.get(String(patientId));
    if (!p) throw new EmrError('NOT_FOUND', 'Patient not found');
    return clone(p);
  }

  async getProvider(providerId) {
    this.#maybeFail('getProvider');
    const p = this.providers.get(String(providerId));
    if (!p) throw new EmrError('NOT_FOUND', 'Provider not found');
    return clone(p);
  }

  async getDayTemplate({ providerId, date }) {
    this.#maybeFail('getDayTemplate');
    this.#provider(providerId);
    const blocks = this.overrides.get(`${providerId}|${date}`) ?? this.weekly.get(providerId)?.[weekdayOf(date)] ?? [];
    return blocks.map((b) => ({
      start: toIso(localToMs(date, b.start, this.tz), this.tz),
      end: toIso(localToMs(date, b.end, this.tz), this.tz),
    }));
  }

  async getAppointments({ providerId, from, to }) {
    this.#maybeFail('getAppointments');
    this.#provider(providerId);
    const f = Date.parse(from);
    const t = Date.parse(to);
    return this.appointments
      .filter((a) => a.providerId === providerId && a.status !== 'cancelled' && Date.parse(a.end) > f && Date.parse(a.start) < t)
      .map(({ id, start, end, patientId, status }) => ({ id, start, end, patientId, status }));
  }

  async createAppointment({ providerId, patientId, start, minutes, reason, notes }) {
    this.#maybeFail('createAppointment');
    this.#provider(providerId);
    await this.getPatient(patientId);
    if (!Number.isFinite(Date.parse(start)) || !(minutes > 0)) throw new EmrError('BAD_REQUEST', 'Bad appointment');
    const s = Date.parse(start);
    const e = s + minutes * 60000;
    this.beforeCreate?.({ providerId, patientId, start, minutes });
    const clash = !this.allowOverlap && this.appointments.some((a) => a.providerId === providerId && a.status !== 'cancelled' && Date.parse(a.start) < e && Date.parse(a.end) > s);
    if (clash) throw new EmrError('CONFLICT', 'That time is already booked');
    const id = `a${++this.seq.appt}`;
    this.appointments.push({ id, providerId, patientId, start: toIso(s, this.tz), end: toIso(e, this.tz), status: 'booked', reason, notes });
    this.afterCreate?.({ id, providerId, patientId, start, minutes });
    return { id };
  }

  /** Optional capability: cancel an appointment so it no longer blocks the slot. */
  async cancelAppointment(id) {
    this.#maybeFail('cancelAppointment');
    const a = this.appointments.find((x) => x.id === String(id));
    if (!a) throw new EmrError('NOT_FOUND', 'Appointment not found');
    a.status = 'cancelled';
  }

  async addTaskComment(taskId, text) {
    this.#maybeFail('addTaskComment');
    const t = this.#task(taskId);
    t.comments.push({ text, at: this.#now(), by: this.agentUserId });
    t.updatedAt = this.#now();
  }

  async completeTask(taskId, note) {
    this.#maybeFail('completeTask');
    const t = this.#task(taskId);
    t.comments.push({ text: note, at: this.#now(), by: this.agentUserId });
    t.status = 'completed';
    t.updatedAt = this.#now();
  }

  async reassignTask(taskId, { toUserId, note }) {
    this.#maybeFail('reassignTask');
    const t = this.#task(taskId);
    t.comments.push({ text: note, at: this.#now(), by: this.agentUserId });
    t.assigneeId = toUserId;
    t.updatedAt = this.#now();
  }

  // ---- seeding and helpers for tests and the demo UI ----

  addProvider({ id, displayName }) {
    this.providers.set(id, { id, displayName });
    return this;
  }

  addPatient({ id, firstName, lastName, mobile = null, email = null }) {
    this.patients.set(id, { id, firstName, lastName, mobile, email });
    return this;
  }

  /** weekly: { 1: [{start:'09:00', end:'12:00'}], ... } keyed by weekday, 0 = Sunday. */
  setWeeklyTemplate(providerId, weekly) {
    this.weekly.set(providerId, weekly);
    return this;
  }

  setDayTemplate(providerId, date, blocks) {
    this.overrides.set(`${providerId}|${date}`, blocks);
    return this;
  }

  /** Put an appointment straight into the schedule. start is an ISO string. */
  addAppointment({ providerId, patientId = 'other', start, minutes = 15, status = 'booked' }) {
    const s = Date.parse(start);
    const id = `a${++this.seq.appt}`;
    this.appointments.push({ id, providerId, patientId, start: toIso(s, this.tz), end: toIso(s + minutes * 60000, this.tz), status, reason: '', notes: '' });
    return id;
  }

  createTaskAsDoctor({ patientId, providerId, message, serviceDate = null, priority = null }) {
    const id = `t${++this.seq.task}`;
    const task = {
      id, patientId, creatorProviderId: providerId, assigneeId: this.agentUserId, message,
      serviceDate, priority, status: 'active', comments: [], updatedAt: this.#now(),
    };
    this.tasks.set(id, task);
    return clone(task);
  }

  listAllTasks() {
    return [...this.tasks.values()].map(clone);
  }

  listAppointments() {
    return this.appointments.map(clone);
  }

  listPatients() {
    return [...this.patients.values()].map(clone);
  }

  listProviders() {
    return [...this.providers.values()].map(clone);
  }

  /** Make the next call to a method throw UNAVAILABLE (tests of restart and error paths). */
  failNext(method) {
    this.failures.set(method, (this.failures.get(method) ?? 0) + 1);
  }

  today() {
    return localDate(this.clock.now(), this.tz);
  }

  tomorrow() {
    return addDays(this.today(), 1);
  }

  #maybeFail(method) {
    if (this.outage) throw new EmrError(this.outage, `Simulated ${this.outage === 'FORBIDDEN' ? 'rejected sign-in' : 'outage'} in ${method}`);
    const n = this.failures.get(method) ?? 0;
    if (n > 0) {
      this.failures.set(method, n - 1);
      throw new EmrError('UNAVAILABLE', `Simulated outage in ${method}`);
    }
  }

  #now() {
    return toIso(this.clock.now(), this.tz);
  }

  #task(id) {
    const t = this.tasks.get(String(id));
    if (!t) throw new EmrError('NOT_FOUND', 'Task not found');
    return t;
  }

  #provider(id) {
    if (!this.providers.has(String(id))) throw new EmrError('NOT_FOUND', 'Provider not found');
  }
}

function clone(v) {
  return structuredClone(v);
}
