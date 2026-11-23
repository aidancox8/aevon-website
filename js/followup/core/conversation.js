// The conversation state machine for one task.
//
//   claiming -> awaiting -> booking -> booked
//        \         |  \
//         \        |   -> awaiting (new times, up to the clinic's limit; or a taken slot)
//          -> handing_back -> handed_back   (reachable from claiming, awaiting and booking)
//
// 'claiming'     the task row exists; the "[Aevon] started" comment and the first offers are still to do
// 'awaiting'     offers are out; waiting for the patient, nudging on a timer
// 'booking'      the patient chose a time; the appointment and task closing are being done
// 'booked'       appointment created, task completed, confirmation queued
// 'handing_back' reason saved; EMR reassignment still to do
// 'handed_back'  task is with front desk
import { EmrError } from '../emr/adapter.js';
import { parseTask, targetDate } from './parseTask.js';
import { normalise } from './text.js';
import { interpret, loose } from './interpret.js';
import { isOptOut, findHandoffWord } from './guard.js';
import { mergeConstraints, parseConstraints } from './constraints.js';
import { daysBetween, friendly, localDate } from './time.js';
import { buildNote, handBack } from './handback.js';
import { sendOffers } from './offers.js';
import { startBooking } from './booking.js';
import { attemptKey, inContactHours } from './outbound.js';
import { normalisePhone, normaliseEmail } from '../channels/address.js';
import { pickChannel, replyChannel } from './channelChoice.js';

export const STARTED_COMMENT = '[Aevon] started';
const MAX_CLARIFICATIONS = 2;
const MAX_MOVES = 2;
const MIN_GAP_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function maybe(call) {
  try {
    return await call();
  } catch (err) {
    if (err instanceof EmrError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

/** First pass over a claimed task: comment, read, check consent, offer. Safe to run again after a restart. */
export async function begin(svc, task) {
  const id = task.task_id;
  const emrTask = await svc.emr.getTask(id);
  // A restarted task (staff gave it back to the agent) gets its own comment; the first one is already on the task.
  const started = task.attempt > 1 ? `${STARTED_COMMENT} again (attempt ${task.attempt})` : STARTED_COMMENT;
  const hasStarted = task.attempt > 1 ? emrTask.comments.some((c) => c.text === started) : emrTask.comments.some((c) => c.text.startsWith(STARTED_COMMENT));
  if (!hasStarted) {
    await svc.audit.around({ taskId: id, action: 'task_comment', before: { comments: emrTask.comments.length } }, async () => {
      await svc.emr.addTaskComment(id, started);
      return { comments: emrTask.comments.length + 1, text: started };
    });
  }

  const patient = await maybe(() => svc.emr.getPatient(emrTask.patientId));
  const provider = await maybe(() => svc.emr.getProvider(emrTask.creatorProviderId));
  svc.tasks.update(id, {
    patient_name: patient ? `${patient.firstName} ${patient.lastName}` : '',
    provider_name: provider?.displayName ?? '',
    task_text: emrTask.message,
    mobile: normalisePhone(patient?.mobile),
    email: normaliseEmail(patient?.email),
  });
  let row = svc.tasks.get(id);
  if (!patient) return handBack(svc, row, { reason: 'Patient not found in the EMR' });
  if (!provider) return handBack(svc, row, { reason: 'Doctor not found in the EMR' });

  const s = svc.settings.get();
  const today = localDate(svc.clock.now(), s.timeZone);
  const parsed = parseTask(emrTask.message, { today, priority: emrTask.priority });
  if (parsed.unclear) return handBack(svc, row, { reason: parsed.reason ?? (parsed.why === 'Could not read the timeframe' ? parsed.why : `Could not read the timeframe (${parsed.why})`) });
  const leadDays = daysBetween(today, targetDate(parsed, today));
  if (leadDays < s.minLeadDays) {
    const when = leadDays <= 0 ? 'due now' : leadDays === 1 ? 'due tomorrow' : `due in ${leadDays} days`;
    return handBack(svc, row, { reason: `Follow-up is ${when}, which is too soon for a text exchange (minimum ${s.minLeadDays} days). Please book it directly` });
  }

  const mode = parsed.mode ?? (s.allowedModes.includes('in-person') ? 'in-person' : s.allowedModes[0]);
  if (!s.allowedModes.includes(mode)) return handBack(svc, row, { reason: `Visit mode "${mode}" is not offered by this clinic` });

  const channel = pickChannel(svc.consent, row);
  if (!channel) {
    const any = svc.consent.get(row.patient_id);
    const reason = any && (any.sms || any.email) ? 'Consent on file but no usable mobile number or email address' : 'No consent to text or email on file';
    return handBack(svc, row, { reason });
  }

  svc.tasks.update(id, { target_date: targetDate(parsed, today), minutes: parsed.minutes ?? s.defaultMinutes, mode });
  row = svc.tasks.get(id);
  const sent = await sendOffers(svc, row, { kind: 'offer', channel });
  if (sent === 'none') return handBack(svc, row, { reason: 'No open times near the requested date' });
  if (sent === 'blocked') return handBack(svc, row, { reason: 'Message blocked by the safety check' });
  return undefined;
}

function revokeConsent(svc, task, channel) {
  const before = svc.consent.get(task.patient_id);
  svc.consent.set({ patientId: task.patient_id, sms: false, email: false, recordedBy: 'patient reply', sourceNote: `Opted out by ${channel} reply` });
  svc.audit.record({ taskId: task.task_id, action: 'consent_revoked', before, after: svc.consent.get(task.patient_id) });
}

async function optOut(svc, task, inbound) {
  revokeConsent(svc, task, inbound.channel);
  if (task.state === 'awaiting') {
    return handBack(svc, task, { reason: 'Patient opted out of messages', reply: 'optout_confirm', replyChannel: inbound.channel });
  }
  svc.outbound.queue({ task, kind: 'optout_confirm', channel: inbound.channel, dedupeKey: `optout:${task.task_id}:${inbound.messageId}` });
  return undefined;
}

async function replyToAwaiting(svc, task, inbound) {
  const s = svc.settings.get();
  const result = await interpret(inbound.body, {
    offers: task.offers, today: localDate(svc.clock.now(), s.timeZone), llm: svc.llm, booked: task.prev_booked_start,
  });
  svc.audit.record({
    taskId: task.task_id, action: 'reply_interpreted',
    after: { intent: result.intent, source: result.source, pick: result.pick ?? null, constraints: result.constraints ?? null },
  });
  const channel = replyChannel(svc.consent, task, inbound.channel);
  const hand = (reason, reply = 'handoff_reply') => handBack(svc, task, { reason, quote: inbound.body, reply, replyChannel: channel });

  if (task.prev_appointment_id && !['optout', 'handoff', 'pick'].includes(result.intent)) {
    const n = loose(inbound.body);
    if (KEEP.test(n) || result.intent === 'keep') return keepBooking(svc, task, channel, 'Patient chose to keep the booked time');
    if (/\bcancel/.test(n)) return hand('Patient asked to cancel the visit');
  }

  const pending = task.pending_index !== null && task.pending_index !== undefined && task.offers[task.pending_index] ? task.pending_index : null;
  if (pending !== null && ((result.intent === 'yes' && result.source === 'llm') || (['yes', 'unknown'].includes(result.intent) && SAYS_YES.test(loose(inbound.body))))) {
    return startBooking(svc, task, pending, inbound.channel);
  }

  switch (result.intent) {
    case 'optout':
      return optOut(svc, task, inbound);
    case 'handoff':
      return hand('Patient message needs staff');
    case 'pick': {
      if (!task.offers[result.pick - 1]) return clarify(svc, task, channel, hand);
      // Read the time back first. The same pick sent twice counts as the yes.
      if (s.confirmBeforeBooking && channel && pending !== result.pick - 1) {
        svc.tasks.update(task.task_id, { pending_index: result.pick - 1 });
        svc.outbound.queue({
          task, kind: 'confirm_ask', channel, vars: { pick: task.offers[result.pick - 1].start },
          dedupeKey: `ask:${task.task_id}:${inbound.messageId}${attemptKey(task)}`,
        });
        return undefined;
      }
      return startBooking(svc, task, result.pick - 1, inbound.channel);
    }
    case 'constraints':
    case 'change': // already choosing new times: the same as asking for others
      return moreTimes(svc, task, result, channel, s, hand);
    case 'yes':
      return clarify(svc, task, channel, hand);
    default:
      // Not understood: ask in plain words before giving the task to staff.
      return clarify(svc, task, channel, hand);
  }
}

async function clarify(svc, task, channel, hand) {
  if (task.clarifications >= MAX_CLARIFICATIONS || !channel) return hand('Reply was still not clear after asking');
  svc.tasks.update(task.task_id, { clarifications: task.clarifications + 1 });
  svc.outbound.queue({ task, kind: 'clarify', channel, dedupeKey: `clarify:${task.task_id}:${task.clarifications}${attemptKey(task)}` });
  return undefined;
}

async function moreTimes(svc, task, result, channel, s, hand) {
  const wanted = result.constraints;
  if (wanted.mode && !s.allowedModes.includes(wanted.mode)) return hand(`Patient asked for a ${wanted.mode} visit, which this clinic does not offer`);
  if (task.rounds >= s.maxNewTimeRounds) return hand(`Patient asked for other times more than ${s.maxNewTimeRounds} times`);
  if (!channel) return hand('No consented channel to reply on');
  const { mode, ...rest } = wanted;
  // Counters change only once the new times are out: if the EMR is down the reply is retried and nothing is used up.
  const patch = { constraints: mergeConstraints(task.constraints, rest), mode: mode ?? task.mode, rounds: task.rounds + 1 };
  // New times are new: nothing already offered in this conversation is offered again, whatever the patient asked for.
  const exclude = [...new Set([...task.offered, ...task.offers.map((o) => o.start)])];
  const sent = await sendOffers(svc, { ...task, ...patch }, { kind: 'more', channel, exclude, patch });
  if (sent !== 'sent') svc.tasks.update(task.task_id, patch);
  if (sent === 'none') return hand('No open times match what the patient asked for (no new times left inside the booking window)');
  if (sent === 'blocked') return hand('Message blocked by the safety check');
  return undefined;
}

const SAYS_YES = /^(?:c|yes|y|yep|yeah|yup|ok|okay|sure|confirm|confirmed|correct|right|book it|go ahead|please do|sounds good|perfect|great|that works|works|oui)\b/;
const KEEP = /^(?:keep|stay|same|original|never ?mind|nvm|leave it|forget it|no change)\b|\bkeep (?:it|the|my|that)\b|\bleave it\b|\bas it is\b|\bnever ?mind\b/;
const CHANGE = /\b(?:change|reschedule|rebook|move|switch|postpone|push|different|another|other|later|earlier|sooner)\b|\b(?:cant|can't|cannot|wont|won't|unable to) (?:make|come|do|attend|be there)\b/;

/** The patient keeps the visit they already had: put the task back to booked, untouched. */
async function keepBooking(svc, task, channel, detail) {
  svc.audit.record({ taskId: task.task_id, action: 'move_dropped', before: { state: task.state }, after: { state: 'booked', booked: task.prev_booked_start }, detail });
  svc.tasks.update(task.task_id, {
    state: 'booked', appointment_id: task.prev_appointment_id, booked_start: task.prev_booked_start,
    prev_appointment_id: null, prev_booked_start: null, chosen_index: null,
  });
  const row = svc.tasks.get(task.task_id);
  if (channel) svc.outbound.queue({ task: row, kind: 'kept', channel, vars: { booked: row.booked_start }, dedupeKey: `kept:${task.task_id}${attemptKey(task)}` });
  return undefined;
}

/**
 * The patient asks to move a booked visit. New times go out and the booked visit stays where it is; it is cancelled
 * only after a new time is booked (booking.js). Returns false when the agent cannot do this and staff should.
 */
async function offerMove(svc, task, inbound, channel) {
  const n = loose(inbound.body);
  const canCancel = typeof svc.emr.cancelAppointment === 'function' && svc.emr.describe().capabilities?.cancelAppointment;
  if (!canCancel || !channel || !task.appointment_id || task.moves >= MAX_MOVES) return false;
  if (/\bcancel/.test(n) || findHandoffWord(inbound.body)) return false;
  if (!CHANGE.test(n)) {
    // Not in the rules' words: let the model say whether this is a request to move the visit.
    if (!svc.llm?.enabled) return false;
    const read = await svc.llm.classify({ text: inbound.body, offers: [], raw: [], booked: friendly(task.booked_start) });
    svc.audit.record({ taskId: task.task_id, action: 'reply_interpreted', after: { intent: read.intent, source: 'llm', state: 'booked' } });
    if (read.intent !== 'change') return false;
  }
  if (Date.parse(task.booked_start) <= svc.clock.now()) return false;
  const s = svc.settings.get();
  const { mode, ...wanted } = parseConstraints(inbound.body, { offers: [], today: localDate(svc.clock.now(), s.timeZone) });
  if (mode && !s.allowedModes.includes(mode)) return false;
  const patch = {
    prev_appointment_id: task.appointment_id, prev_booked_start: task.booked_start, appointment_id: null, booked_start: null,
    chosen_index: null, booked_channel: null, rounds: 0, clarifications: 0, taken_count: 0, moves: task.moves + 1,
    constraints: wanted, mode: mode ?? task.mode,
  };
  const exclude = [...new Set([...(task.offered ?? []), task.booked_start])];
  const sent = await sendOffers(svc, { ...task, ...patch }, { kind: 'reschedule', channel, exclude, patch });
  if (sent !== 'sent') return false;
  svc.audit.record({ taskId: task.task_id, action: 'move_offered', before: { booked: task.booked_start }, detail: 'Patient asked to move the visit; it stays booked until a new time is picked' });
  return true;
}

const THANKS = /^(?:thanks?|thank you|thx|ty|ok|okay|great|perfect|sounds good|got it|see you then|will do|cool|yes|y|yep|yeah|yup|sure|c|confirm|confirmed|\u{1F44D})(?: so much| very much| a lot)?$/u;

/**
 * A reply after the appointment is booked. A request to move the visit gets new times (offerMove). Anything else goes to
 * front desk as a task note (the task is reassigned to them with the patient's words), and the patient gets one short
 * acknowledgement. A bare "thanks" or "ok" is only logged.
 */
async function replyAfterBooking(svc, task, inbound) {
  const channel = replyChannel(svc.consent, task, inbound.channel);
  if (THANKS.test(loose(inbound.body)) || THANKS.test(inbound.body.trim().toLowerCase())) {
    svc.audit.record({ taskId: task.task_id, action: 'inbound_ignored', detail: 'Reply after booking was a thank you' });
    return undefined;
  }
  if (await offerMove(svc, task, inbound, channel)) return undefined;
  const { frontDeskUserId } = svc.settings.get();
  const note = buildNote('Patient replied after the appointment was booked. The appointment was not changed. Please call the patient if they need a change', inbound.body);
  await svc.audit.around({ taskId: task.task_id, action: 'staff_note', before: { assigneeId: null }, detail: 'Reply after booking sent to front desk' }, async () => {
    await svc.emr.reassignTask(task.task_id, { toUserId: frontDeskUserId, note });
    return { assigneeId: frontDeskUserId, note };
  });
  svc.tasks.update(task.task_id, { staff_note: note });
  if (!task.post_notice && channel) {
    svc.tasks.update(task.task_id, { post_notice: 1 });
    svc.outbound.queue({ task, kind: 'post_booking', channel, vars: { booked: task.booked_start }, dedupeKey: `post:${task.task_id}${attemptKey(task)}` });
  }
  return undefined;
}

/** A reply from the patient. Duplicate and unknown-sender checks happen in the engine before this. */
export async function onReply(svc, task, inbound) {
  if (task.state === 'awaiting') return replyToAwaiting(svc, task, inbound);

  if (isOptOut(inbound.body)) return optOut(svc, task, inbound);

  if (task.state === 'booked') return replyAfterBooking(svc, task, inbound);
  svc.audit.record({ taskId: task.task_id, action: 'inbound_ignored', detail: `Reply while task is ${task.state}` });
  return undefined;
}

/** Timers for a task that is waiting: nudge twice, then hand back. */
export async function onTick(svc, task) {
  if (task.state !== 'awaiting' || !task.first_sent_at || svc.messages.hasQueued(task.task_id)) return;
  const s = svc.settings.get();
  const now = svc.clock.now();
  const hours = (now - task.first_sent_at) / HOUR_MS;
  if (task.prev_appointment_id) {
    // No answer to new times for a move: the visit simply stays as booked. No reminders.
    if (hours >= s.nudgeHours1) await keepBooking(svc, task, pickChannel(svc.consent, task), 'No reply to the new times');
    return;
  }
  const last = svc.messages.lastOutbound(task.task_id);
  if (last?.sentAt && now - last.sentAt < MIN_GAP_MS) return;

  if (task.nudges >= 2) {
    if (hours >= s.giveUpHours) await handBack(svc, task, { reason: 'No reply after 2 messages' });
    return;
  }
  const due = task.nudges === 0 ? s.nudgeHours1 : s.nudgeHours2;
  if (hours < due || !inContactHours(now, s)) return;

  const second = task.nudges === 1;
  const channel = pickChannel(svc.consent, task, { preferEmail: second && task.channel === 'sms' });
  if (!channel) {
    await handBack(svc, task, { reason: 'No consent to text or email on file' });
    return;
  }
  svc.audit.record({ taskId: task.task_id, action: 'nudge_due', before: { nudges: task.nudges }, after: { nudges: task.nudges + 1, channel } });
  svc.tasks.update(task.task_id, { nudges: task.nudges + 1, channel });
  svc.outbound.queue({
    task: svc.tasks.get(task.task_id), kind: 'nudge', channel, vars: { offers: task.offers, nudgeNo: task.nudges + 1 },
    dedupeKey: `nudge:${task.task_id}:${task.rounds}:${task.taken_count}:${task.nudges + 1}${attemptKey(task)}`,
  });
}
