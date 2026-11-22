// Outbound messages: compose, safety check, queue in SQLite, deliver only inside contact hours.
// Delivery is at least once: a crash between the channel call and the status update may resend one message.
import { compose, OFFER_KINDS } from '../channels/templates.js';
import { smsSegments } from '../channels/segments.js';
import { checkOutbound } from './guard.js';
import { localMinutes } from './time.js';

/** Suffix for dedupe keys: a restarted task (attempt 2 or more) must not collide with the keys of its earlier attempts. */
export const attemptKey = (task) => (task.attempt > 1 ? `:r${task.attempt}` : '');

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export function inContactHours(ms, s) {
  const m = localMinutes(ms, s.timeZone);
  return m >= toMinutes(s.contactStart) && m < toMinutes(s.contactEnd);
}

export function createOutbound({ messages, audit, consent, tasks, channels, settings, clock }) {
  /**
   * Compose and queue one message. Returns { status: 'queued', message } | { status: 'duplicate' } | { status: 'blocked', reason }.
   * dedupeKey makes the call safe to repeat: a second call with the same key does nothing.
   */
  function queue({ task, kind, channel, vars = {}, dedupeKey }) {
    const s = settings.get();
    const firstName = String(task.patient_name ?? '').trim().split(/\s+/)[0] || '';
    const { subject, body } = compose(kind, channel, {
      clinic: s.clinicName, doctor: task.provider_name || 'your doctor', mode: task.mode, firstName, phone: s.clinicPhone || '', offers: task.offers, ...vars,
    });
    const unsafe = checkOutbound(`${subject ?? ''}\n${body}`, { taskText: task.task_text });
    if (unsafe) {
      audit.record({ taskId: task.task_id, action: 'message_blocked', detail: `Safety check: ${unsafe}` });
      return { status: 'blocked', reason: unsafe };
    }
    const message = messages.insert({
      taskId: task.task_id, patientId: task.patient_id, channel, direction: 'out', kind,
      address: channel === 'sms' ? task.mobile : task.email, subject, body,
      segments: channel === 'sms' ? smsSegments(body) : 0, status: 'queued', dedupeKey,
    });
    if (!message) return { status: 'duplicate' };
    audit.record({ taskId: task.task_id, action: 'message_queued', after: { id: message.id, channel, kind, segments: message.segments } });
    return { status: 'queued', message };
  }

  async function deliver(m) {
    if (m.kind !== 'optout_confirm' && !consent.allows(m.patientId, m.channel)) {
      messages.markBlocked(m.id, 'No consent for this channel at send time');
      audit.record({ taskId: m.taskId, action: 'message_blocked', before: { id: m.id, status: 'queued' }, after: { status: 'blocked' }, detail: 'No consent for this channel at send time' });
      return { blocked: true, taskId: m.taskId };
    }
    await audit.around({ taskId: m.taskId, action: 'message_send', before: { id: m.id, channel: m.channel, kind: m.kind, status: 'queued' } }, async () => {
      const { delivery } = await channels[m.channel].send(m);
      messages.markSent(m.id, delivery);
      if (OFFER_KINDS.includes(m.kind) && m.taskId) tasks.update(m.taskId, { first_sent_at: clock.now() });
      return { id: m.id, channel: m.channel, kind: m.kind, status: 'sent', segments: m.segments, delivery };
    });
    return { sent: true };
  }

  /** Deliver everything queued, if the clinic's contact hours are open. Returns task ids whose message was blocked. */
  async function flush() {
    const blocked = [];
    if (!inContactHours(clock.now(), settings.get())) return { sent: 0, blocked };
    let sent = 0;
    for (const m of messages.queuedOutbound()) {
      const r = await deliver(m);
      if (r.sent) sent += 1;
      else if (r.taskId) blocked.push(r.taskId);
    }
    return { sent, blocked };
  }

  return { queue, flush };
}
