// Booking a chosen offer. Re-reads the schedule right before booking, never books outside the day
// template, handles a slot taken at the last moment, and can resume after a restart.
import { EmrError } from '../emr/adapter.js';
import { slotIsFree } from './slots.js';
import { isClosed } from './closures.js';
import { addDays, isoDate, localDate, localToMs, noteStamp, toIso } from './time.js';
import { channelWord, replyChannel } from './channelChoice.js';
import { handBack } from './handback.js';
import { sendOffers } from './offers.js';
import { attemptKey } from './outbound.js';

const MAX_TAKEN_RETRIES = 2;

function dayRange(svc, date) {
  const { timeZone } = svc.settings.get();
  return { from: toIso(localToMs(date, '00:00', timeZone), timeZone), to: toIso(localToMs(addDays(date, 1), '00:00', timeZone), timeZone) };
}

async function stillFree(svc, task, offer) {
  const s = svc.settings.get();
  const date = isoDate(offer.start);
  const nowMs = svc.clock.now();
  if (Date.parse(offer.start) <= nowMs || date <= localDate(nowMs, s.timeZone)) return { free: false };
  if (isClosed(date, s)) return { free: false }; // a closure added after the offer went out
  const { from, to } = dayRange(svc, date);
  const [blocks, appointments] = await Promise.all([
    svc.emr.getDayTemplate({ providerId: task.provider_id, date }),
    svc.emr.getAppointments({ providerId: task.provider_id, from, to }),
  ]);
  const mine = appointments.find((a) => a.patientId === task.patient_id && Date.parse(a.start) === Date.parse(offer.start));
  if (mine) return { free: true, existingId: mine.id };
  return { free: slotIsFree({ blocks, appointments, start: offer.start, minutes: offer.minutes }) };
}

const byId = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

/**
 * Close the booking race as far as the EMR allows. After creating the appointment, read the schedule again. If another
 * appointment now overlaps ours (it was created in the gap since the free check), the rule is: keep ours only if ours has
 * the lower id. Otherwise remove ours if the adapter can cancel, else hand the task back with a note naming both.
 * Returns the other appointment when ours must go, or null when all is well.
 */
async function overlapAfterCreate(svc, task, offer, appointmentId) {
  const s = Date.parse(offer.start);
  const e = s + offer.minutes * 60000;
  const { from, to } = dayRange(svc, isoDate(offer.start));
  const appointments = await svc.emr.getAppointments({ providerId: task.provider_id, from, to });
  const others = appointments.filter((a) => String(a.id) !== String(appointmentId) && Date.parse(a.start) < e && Date.parse(a.end) > s);
  return others.find((a) => byId(appointmentId, a.id) > 0) ?? null;
}

async function giveUpOurs(svc, task, offer, appointmentId, other) {
  const channel = replyChannel(svc.consent, task, task.booked_channel ?? task.channel);
  const why = `Another appointment (${other.id}) was created for this time before ours (${appointmentId})`;
  const canCancel = typeof svc.emr.cancelAppointment === 'function' && svc.emr.describe().capabilities?.cancelAppointment;
  if (canCancel) {
    await svc.audit.around({ taskId: task.task_id, action: 'appointment_cancel', before: { appointmentId, slot: offer.start, other: other.id }, detail: why }, async () => {
      await svc.emr.cancelAppointment(appointmentId);
      return { appointmentId, status: 'cancelled' };
    });
    return slotTaken(svc, task, `Double booking: ${why}. Ours was cancelled`);
  }
  svc.tasks.update(task.task_id, { appointment_id: appointmentId, booked_start: offer.start });
  return handBack(svc, svc.tasks.get(task.task_id), {
    reason: `Double booking at ${noteStamp(offer.start)}: ${why}, and the EMR cannot cancel appointments from here. Please keep one and cancel the other`,
    reply: 'handoff_reply', replyChannel: channel,
  });
}

export async function startBooking(svc, task, index, channel) {
  svc.audit.record({
    taskId: task.task_id, action: 'booking_chosen',
    before: { state: task.state }, after: { state: 'booking', offer: task.offers[index].start },
  });
  svc.tasks.update(task.task_id, { state: 'booking', chosen_index: index, booked_channel: channel });
  await continueBooking(svc, svc.tasks.get(task.task_id));
}

export async function continueBooking(svc, task) {
  const offer = task.offers[task.chosen_index];
  let current = task;

  if (!current.appointment_id) {
    const check = await stillFree(svc, current, offer);
    if (!check.free) return slotTaken(svc, current, 'Slot no longer free at booking time');
    let appointmentId = check.existingId;
    if (!appointmentId) {
      try {
        const created = await svc.audit.around({
          taskId: current.task_id, action: 'appointment_create', before: { slot: offer.start, appointment: null },
        }, () => svc.emr.createAppointment({
          providerId: current.provider_id, patientId: current.patient_id, start: offer.start, minutes: offer.minutes,
          reason: 'Follow-up', notes: `Booked by the follow-up agent for task ${current.task_id}`,
        }));
        appointmentId = created.id;
      } catch (err) {
        if (err instanceof EmrError && err.code === 'CONFLICT') return slotTaken(svc, current, 'EMR reported a conflict');
        throw err;
      }
    }
    const loser = await overlapAfterCreate(svc, current, offer, appointmentId);
    if (loser) return giveUpOurs(svc, current, offer, appointmentId, loser);
    svc.tasks.update(current.task_id, { appointment_id: appointmentId, booked_start: offer.start });
    current = svc.tasks.get(current.task_id);
  }

  const note = `Booked ${noteStamp(offer.start)} by ${channelWord(current.booked_channel)}`;
  const emrTask = await svc.emr.getTask(current.task_id);
  if (emrTask.status !== 'completed') {
    await svc.audit.around({
      taskId: current.task_id, action: 'task_complete', before: { status: emrTask.status, assigneeId: emrTask.assigneeId },
    }, async () => {
      await svc.emr.completeTask(current.task_id, note);
      return { status: 'completed', note };
    });
  }

  const channel = replyChannel(svc.consent, current, current.booked_channel);
  if (channel) svc.outbound.queue({ task: current, kind: 'confirm', channel, vars: { booked: offer.start }, dedupeKey: `confirm:${current.task_id}${attemptKey(current)}` });
  svc.tasks.update(current.task_id, { state: 'booked', booked_at: svc.clock.now() });
}

async function slotTaken(svc, task, why) {
  const taken = task.taken_count + 1;
  svc.audit.record({ taskId: task.task_id, action: 'slot_taken', before: { offer: task.offers[task.chosen_index].start }, detail: why });
  const channel = replyChannel(svc.consent, task, task.booked_channel ?? task.channel);
  const release = { taken_count: taken, chosen_index: null };
  const handOff = (reason) => {
    svc.tasks.update(task.task_id, { ...release, state: 'awaiting' });
    return handBack(svc, svc.tasks.get(task.task_id), { reason, reply: 'handoff_reply', replyChannel: channel });
  };
  if (taken > MAX_TAKEN_RETRIES) return handOff('Chosen times kept being taken');
  // The task stays in 'booking' until the new times are out, so an EMR outage here is retried by the next poll.
  // Site demo only: this line differs from the prototype. The prototype offers the two untaken times again here;
  // the demo passes every time already offered as `exclude`, so the rule "a time already offered is never offered
  // again" also holds after a taken slot.
  const exclude = [...new Set([...(task.offered ?? []), ...task.offers.map((o) => o.start)])];
  const sent = channel ? await sendOffers(svc, { ...task, ...release }, { kind: 'taken', channel, exclude, patch: release }) : 'none';
  if (sent !== 'sent') return handOff('No open times left after the chosen time was taken');
  return undefined;
}
