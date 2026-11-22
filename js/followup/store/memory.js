// Browser stand-ins for the prototype's SQLite stores (consent, audit, messages, tasks).
// Same methods and the same results as the originals, held in arrays for the life of the page.
const copy = (v) => (v === null || v === undefined ? v : structuredClone(v));

export function createConsent(db, clock) {
  const rows = new Map();
  return {
    get(patientId) {
      return copy(rows.get(String(patientId)) ?? null);
    },
    allows(patientId, channel) {
      const c = this.get(patientId);
      return !!c && c[channel] === true;
    },
    set({ patientId, sms, email, recordedBy, sourceNote = '' }) {
      if (!patientId || !recordedBy) throw new TypeError('Consent needs a patient id and who recorded it');
      rows.set(String(patientId), {
        patientId: String(patientId), sms: !!sms, email: !!email, recordedBy: String(recordedBy).slice(0, 80),
        recordedAt: clock.now(), sourceNote: String(sourceNote).slice(0, 300),
      });
    },
    list() {
      return [...rows.values()].sort((a, b) => a.patientId.localeCompare(b.patientId)).map(copy);
    },
  };
}

export function createAudit(db, clock) {
  const rows = [];
  function record({ taskId = null, actor = 'agent', action, before = null, after = null, detail = null }) {
    rows.push({ id: rows.length + 1, at: clock.now(), taskId: taskId === null ? null : String(taskId), actor, action, before: copy(before), after: copy(after), detail });
  }
  async function around({ taskId, actor = 'agent', action, before, detail }, call) {
    record({ taskId, actor, action: `${action}:start`, before, detail });
    try {
      const result = await call();
      record({ taskId, actor, action: `${action}:done`, before, after: result ?? null, detail });
      return result;
    } catch (err) {
      record({ taskId, actor, action: `${action}:failed`, before, detail: `${err.code ?? err.name}: ${err.message}` });
      throw err;
    }
  }
  function list({ taskId = null, limit = 500 } = {}) {
    const all = taskId === null ? rows : rows.filter((r) => r.taskId === String(taskId));
    return all.slice(-limit).reverse().map(copy);
  }
  return { record, around, list };
}

export function createMessages(db, clock) {
  const rows = [];
  const out = (r) => (r ? copy(r) : null);
  const find = (id) => rows.find((r) => r.id === id);
  return {
    insert({ taskId = null, patientId = null, channel, direction, kind = '', address = null, subject = null, body, segments = 1, status, dedupeKey = null }) {
      if (dedupeKey !== null && rows.some((r) => r.dedupeKey === dedupeKey)) return null;
      const row = {
        id: rows.length + 1, taskId: taskId === null ? null : String(taskId), patientId: patientId === null ? null : String(patientId),
        channel, direction, kind, address, subject, body, segments, status, dedupeKey, note: null, createdAt: clock.now(), sentAt: null,
      };
      rows.push(row);
      return out(row);
    },
    get(id) {
      return out(find(id));
    },
    markSent(id, note = null) {
      const r = find(id);
      if (r) { r.status = 'sent'; r.sentAt = clock.now(); r.note = note; }
    },
    setStatus(id, status) {
      const r = find(id);
      if (r) r.status = status;
    },
    pendingInbound() {
      return rows.filter((r) => r.direction === 'in' && r.status === 'retry').map(out);
    },
    markBlocked(id, note) {
      const r = find(id);
      if (r) { r.status = 'blocked'; r.note = String(note).slice(0, 300); }
    },
    hasQueued(taskId) {
      return rows.some((r) => r.taskId === String(taskId) && r.direction === 'out' && r.status === 'queued');
    },
    queuedOutbound() {
      return rows.filter((r) => r.direction === 'out' && r.status === 'queued').map(out);
    },
    forTask(taskId) {
      return rows.filter((r) => r.taskId === String(taskId)).map(out);
    },
    thread(patientId, channel) {
      return rows.filter((r) => r.patientId === String(patientId) && r.channel === channel).map(out);
    },
    patientsWith(channel) {
      return [...new Set(rows.filter((r) => r.channel === channel && r.patientId !== null).map((r) => r.patientId))].sort();
    },
    hasDedupeKey(key) {
      return rows.some((r) => r.dedupeKey === key);
    },
    lastInbound(taskId) {
      return out(rows.filter((r) => r.taskId === String(taskId) && r.direction === 'in').at(-1));
    },
    lastOutbound(taskId) {
      return out(rows.filter((r) => r.taskId === String(taskId) && r.direction === 'out' && r.status !== 'queued').at(-1));
    },
    hasOutboundAfter(taskId, id, kinds) {
      return rows.some((r) => r.taskId === String(taskId) && r.direction === 'out' && r.id > id && kinds.includes(r.kind));
    },
    countOutbound(taskId) {
      return rows.filter((r) => r.taskId === String(taskId) && r.direction === 'out').length;
    },
  };
}

const COLUMNS = new Set([
  'patient_name', 'provider_name', 'task_text', 'state', 'channel', 'mobile', 'email', 'target_date', 'minutes', 'mode',
  'constraints', 'offers', 'rounds', 'nudges', 'clarifications', 'taken_count', 'first_sent_at', 'post_notice',
  'chosen_index', 'booked_channel', 'appointment_id', 'booked_start', 'handback_reason', 'handback_note',
  'offered', 'attempt', 'booked_at', 'staff_note', 'prev_appointment_id', 'prev_booked_start', 'moves',
]);
const ACTIVE_STATES = ['claiming', 'awaiting', 'booking', 'handing_back'];

export function createTasks(db, clock) {
  const rows = new Map();
  let seq = 0; // insertion order, the tie-break SQLite's rowid gave
  const out = (r) => (r ? copy(r) : null);
  const newest = (a, b) => b.updated_at - a.updated_at || b.seq - a.seq;
  return {
    get(taskId) {
      return out(rows.get(String(taskId)));
    },
    claim({ taskId, patientId, providerId }) {
      const id = String(taskId);
      if (rows.has(id)) return false;
      const now = clock.now();
      rows.set(id, {
        task_id: id, patient_id: String(patientId), patient_name: '', provider_id: String(providerId), provider_name: '', task_text: '',
        state: 'claiming', channel: null, mobile: null, email: null, target_date: null, minutes: null, mode: null,
        constraints: {}, offers: [], rounds: 0, nudges: 0, clarifications: 0, taken_count: 0, first_sent_at: null, post_notice: 0,
        chosen_index: null, booked_channel: null, appointment_id: null, booked_start: null, handback_reason: null, handback_note: null,
        created_at: now, updated_at: now, offered: [], attempt: 1, booked_at: null, staff_note: null,
        prev_appointment_id: null, prev_booked_start: null, moves: 0, seq: ++seq,
      });
      return true;
    },
    update(taskId, patch) {
      const keys = Object.keys(patch);
      for (const k of keys) if (!COLUMNS.has(k)) throw new TypeError(`Unknown task column: ${k}`);
      const row = rows.get(String(taskId));
      if (!row || !keys.length) return;
      for (const k of keys) row[k] = copy(patch[k]);
      row.updated_at = clock.now();
    },
    restart(taskId) {
      const row = this.get(taskId);
      this.update(taskId, {
        state: 'claiming', channel: null, constraints: {}, offers: [], offered: [], rounds: 0, nudges: 0, clarifications: 0,
        taken_count: 0, first_sent_at: null, post_notice: 0, chosen_index: null, booked_channel: null, appointment_id: null,
        booked_start: null, booked_at: null, handback_reason: null, handback_note: null, staff_note: null, attempt: row.attempt + 1,
        prev_appointment_id: null, prev_booked_start: null, moves: 0,
      });
      return this.get(taskId);
    },
    list() {
      return [...rows.values()].sort((a, b) => b.created_at - a.created_at || b.seq - a.seq).map(out);
    },
    byState(states) {
      return [...rows.values()].filter((r) => states.includes(r.state)).sort((a, b) => a.created_at - b.created_at || a.seq - b.seq).map(out);
    },
    unfinished() {
      return this.byState(ACTIVE_STATES);
    },
    matchInbound(channel, address) {
      const col = channel === 'sms' ? 'mobile' : 'email';
      const mine = [...rows.values()].filter((r) => r[col] === address).sort(newest);
      return out(mine.find((r) => r.state === 'awaiting') ?? mine[0]);
    },
  };
}
