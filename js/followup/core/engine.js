// The engine: polls the EMR for tasks assigned to the agent, claims each once, advances every
// conversation, matches inbound replies, and delivers queued messages inside contact hours.
// Everything runs one job at a time, so two polls (or a poll and a reply) never interleave.
import { assertAdapter, EmrError } from '../emr/adapter.js';
import { createOutbound } from './outbound.js';
import { begin, onReply, onTick, STARTED_COMMENT } from './conversation.js';
import { continueBooking } from './booking.js';
import { continueHandback, handBack } from './handback.js';
import { clean } from './text.js';
import { normalisePhone, normaliseEmail } from '../channels/address.js';
import { trackHealth } from './health.js';

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const ASKS_FOR_ANSWER = ['offer', 'more', 'taken', 'nudge', 'clarify', 'reschedule'];
const lastDigits = (s) => String(s ?? '').replace(/\D/g, '').slice(-4);

export function createEngine({ emr: rawEmr, db, stores, channels, settings, clock, llm = null, logger = console, lock, health }) {
  assertAdapter(rawEmr);
  const { tasks, messages, audit, consent } = stores;
  // Every adapter call below goes through the health tracker (consecutive failures, last good call).
  const emr = health ? trackHealth(rawEmr, health) : rawEmr;
  const outbound = createOutbound({ messages, audit, consent, tasks, channels, settings, clock });
  const svc = { emr, db, tasks, messages, audit, consent, settings, clock, outbound, llm };

  let queue = Promise.resolve();
  const run = (job) => {
    const result = queue.then(job);
    queue = result.catch(() => {});
    return result;
  };

  /** Log the code only: never message bodies or patient names. */
  const lastError = new Map();
  const ERROR_REPEAT_MS = 10 * 60 * 1000;
  function fail(taskId, err) {
    // An outage repeats the same error every poll; write it once per ten minutes per task, not thousands of times.
    const detail = `${err.code ?? err.name}: ${err.message}`;
    const key = String(taskId);
    const prev = lastError.get(key);
    if (prev && prev.detail === detail && clock.now() - prev.at < ERROR_REPEAT_MS) return;
    lastError.set(key, { detail, at: clock.now() });
    audit.record({ taskId, action: 'error', detail });
    logger.error(`[aevon] task ${taskId}: ${err.code ?? err.name}`);
  }

  async function guarded(taskId, work) {
    try {
      await work();
    } catch (err) {
      fail(taskId, err);
    }
  }

  async function sweepBlocked(taskIds) {
    for (const id of new Set(taskIds)) {
      const row = tasks.get(id);
      if (row && row.state === 'awaiting') await handBack(svc, row, { reason: 'Consent withdrawn before the message could be sent' });
    }
  }

  async function flush() {
    if (health?.isDegraded()) return; // messages are paused while the EMR cannot be reached
    const { blocked } = await outbound.flush();
    await sweepBlocked(blocked);
  }

  async function claimNew() {
    const { agentUserId } = settings.get();
    const assigned = await emr.listAssignedTasks({ assigneeId: agentUserId });
    let claimed = 0;
    for (const t of assigned) {
      const known = tasks.get(t.id);
      if (known) {
        // Handed back earlier and assigned to the agent again by staff: a fresh attempt, with the earlier history kept.
        if (known.state === 'handed_back' && t.status === 'active') restart(known);
        continue;
      }
      const inserted = tasks.claim({ taskId: t.id, patientId: t.patientId, providerId: t.creatorProviderId });
      if (!inserted) continue;
      claimed += 1;
      audit.record({ taskId: t.id, action: 'task_claim', before: { assigneeId: t.assigneeId, status: t.status }, after: { state: 'claiming' } });
      if (t.comments.some((c) => c.text.startsWith(STARTED_COMMENT))) {
        await guarded(t.id, () => handBack(svc, tasks.get(t.id), { reason: 'The agent had already started this task but its record is missing. Please review' }));
      }
    }
    return claimed;
  }

  function restart(known) {
    audit.record({
      taskId: known.task_id, action: 'task_restart',
      before: { state: known.state, attempt: known.attempt, handbackReason: known.handback_reason },
      after: { state: 'claiming', attempt: known.attempt + 1 },
      detail: `Staff assigned the task to the agent again after it was handed back. Starting attempt ${known.attempt + 1}; earlier history is kept`,
    });
    tasks.restart(known.task_id);
  }

  /** Replies that arrived while the EMR was down are answered as soon as it is back. */
  async function retryDeferredReplies() {
    for (const m of messages.pendingInbound()) {
      const row = tasks.get(m.taskId);
      messages.setStatus(m.id, 'received');
      if (!row) continue;
      try {
        await onReply(svc, row, { channel: m.channel, body: m.body, messageId: m.id });
        audit.record({ taskId: row.task_id, action: 'inbound_retried', after: { id: m.id } });
      } catch (err) {
        messages.setStatus(m.id, 'retry');
        fail(row.task_id, err);
        return;
      }
    }
  }

  async function advance(row) {
    if (row.state === 'claiming') return begin(svc, row);
    if (row.state === 'booking') return continueBooking(svc, row);
    if (row.state === 'handing_back') return continueHandback(svc, row);
    return onTick(svc, row);
  }

  let zoneWarned = false;
  /** The EMR's own wall-clock zone and the clinic setting must agree, or every offered time would be shifted. */
  function zoneMismatch() {
    const emrZone = emr.describe().timeZone;
    const clinicZone = settings.get().timeZone;
    if (!emrZone || emrZone === clinicZone) {
      zoneWarned = false;
      return false;
    }
    if (!zoneWarned) {
      zoneWarned = true;
      audit.record({ action: 'error', detail: `CONFIG: clinic time zone is ${clinicZone} but the EMR adapter works in ${emrZone}. Nothing is sent or booked until they match` });
      logger.error('[aevon] clinic time zone differs from the EMR adapter time zone; paused');
    }
    return true;
  }

  /** One pass: claim new tasks, advance every unfinished one, deliver queued messages. */
  function poll() {
    return run(async () => {
      if (lock && !lock.acquire()) return { claimed: 0, readOnly: true };
      if (zoneMismatch()) return { claimed: 0, paused: 'time zone mismatch' };
      let claimed = 0;
      try {
        claimed = await claimNew();
      } catch (err) {
        fail(null, err);
      }
      if (health?.isDegraded()) return { claimed, paused: 'EMR unreachable' };
      await retryDeferredReplies();
      for (const row of tasks.unfinished()) await guarded(row.task_id, () => advance(tasks.get(row.task_id)));
      await guarded(null, flush);
      return { claimed };
    });
  }

  /**
   * A reply from a patient. Returns { matched, duplicate?, taskId?, state? }.
   * Errors from the EMR propagate to the caller; the reply itself is already saved.
   */
  function handleInbound({ channel, address, body, externalId = null }) {
    return run(async () => {
      if (lock && !lock.acquire()) return { matched: false, readOnly: true };
      const addr = channel === 'sms' ? normalisePhone(address) : normaliseEmail(address);
      const text = clean(body);
      const task = addr ? tasks.matchInbound(channel, addr) : null;
      if (!task) {
        audit.record({ action: 'inbound_unknown_sender', detail: `${channel} from an address that matches no patient (ends ${lastDigits(address) || 'n/a'})` });
        return { matched: false };
      }
      const previous = messages.lastInbound(task.task_id);
      // A repeat is only a duplicate if the clinic has asked nothing new since: "1" sent again after new times were offered is a real answer.
      const repeated = previous && previous.channel === channel && previous.body === text && clock.now() - previous.createdAt < DUPLICATE_WINDOW_MS
        && !messages.hasOutboundAfter(task.task_id, previous.id, ASKS_FOR_ANSWER);
      const sameId = externalId && messages.hasDedupeKey(`in:${externalId}`);
      if (repeated || sameId) {
        audit.record({ taskId: task.task_id, action: 'inbound_duplicate', detail: `Ignored a repeated ${channel} message` });
        return { matched: true, duplicate: true, taskId: task.task_id, state: task.state };
      }
      const saved = messages.insert({
        taskId: task.task_id, patientId: task.patient_id, channel, direction: 'in', kind: 'reply', address: addr,
        body: text, segments: 0, status: 'received', dedupeKey: externalId ? `in:${externalId}` : null,
      });
      audit.record({ taskId: task.task_id, action: 'inbound_received', after: { id: saved.id, channel, state: task.state } });
      try {
        await onReply(svc, task, { channel, body: text, messageId: saved.id });
      } catch (err) {
        // The reply is saved. If the EMR is unavailable the next poll answers it, so the sender gets an acknowledgement, not an error.
        // FORBIDDEN is how an expired sign-in can look; it is kept the same way and the health banner tells staff.
        if (!(err instanceof EmrError) || !['UNAVAILABLE', 'FORBIDDEN'].includes(err.code)) throw err;
        messages.setStatus(saved.id, 'retry');
        audit.record({ taskId: task.task_id, action: 'inbound_deferred', detail: `EMR not usable (${err.message}); the reply will be handled on a later poll` });
        return { matched: true, deferred: true, taskId: task.task_id, state: tasks.get(task.task_id).state };
      }
      await flush();
      return { matched: true, taskId: task.task_id, state: tasks.get(task.task_id).state };
    });
  }

  /** True when another process holds the engine lock: this one only serves the web UI. */
  const readOnly = () => (lock ? lock.tried() && !lock.holds() : false);

  return { poll, handleInbound, run, svc, readOnly };
}
