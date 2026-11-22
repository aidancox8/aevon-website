// Plain-words status for a task: what state it is in, and what the agent is waiting for next and when it will act.
import { addDays, friendlyAt, localDate, localToMs, localMinutes, shortWhen } from './time.js';

const HOUR = 3600000;
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** The first moment at or after ms that is inside the clinic's contact hours. */
export function nextContactTime(ms, s) {
  const m = localMinutes(ms, s.timeZone);
  const start = toMinutes(s.contactStart);
  const end = toMinutes(s.contactEnd);
  if (m >= start && m < end) return ms;
  const day = localDate(ms, s.timeZone);
  const startToday = localToMs(day, s.contactStart, s.timeZone);
  if (m < start) return startToday;
  return localToMs(addDays(day, 1), s.contactStart, s.timeZone);
}

const channelWord = (c) => (c === 'sms' ? 'text' : 'email');

/**
 * @param {object} task the agent's task row
 * @param {object} s clinic settings
 * @param {number} nowMs
 * @param {{queued?: boolean}} o queued: a message for this task is waiting for contact hours
 * @returns {{words: string, next: string}} words: the state in plain words; next: what happens next
 */
export function describeTask(task, s, nowMs, { queued = false } = {}) {
  const when = (ms) => shortWhen(ms, s.timeZone, nowMs);
  switch (task.state) {
    case 'claiming':
      return { words: 'Starting: reading the task', next: 'Will contact the patient on the next check' };
    case 'awaiting': {
      if (task.prev_appointment_id) {
        return { words: `Patient asked to move the visit booked for ${friendlyAt(task.prev_booked_start)}`, next: 'New times are out. The visit stays as booked unless the patient picks one' };
      }
      if (task.pending_index !== null && task.pending_index !== undefined && task.offers[task.pending_index]) {
        return { words: `Patient picked ${friendlyAt(task.offers[task.pending_index].start)}`, next: 'Waiting for the patient to reply C to confirm' };
      }
      if (!task.first_sent_at) {
        return queued
          ? { words: 'Ready to message the patient', next: `Message goes out when contact hours open (${when(nextContactTime(nowMs, s))})` }
          : { words: 'Ready to message the patient', next: 'Will send on the next check' };
      }
      const hours = task.nudges === 0 ? s.nudgeHours1 : task.nudges === 1 ? s.nudgeHours2 : s.giveUpHours;
      let due = task.first_sent_at + hours * HOUR;
      if (task.nudges < 2) due = nextContactTime(due, s);
      const label = task.nudges === 0 ? 'First reminder' : task.nudges === 1 ? 'Second reminder' : 'Hand back to front desk if there is no reply';
      const by = channelWord(task.channel);
      return { words: `Waiting for reply (offer sent by ${by})`, next: `${label} ${when(due)}` };
    }
    case 'booking':
      return { words: 'Booking the time the patient chose', next: 'Will confirm to the patient and close the task' };
    case 'booked':
      return { words: `Booked for ${friendlyAt(task.booked_start)}`, next: 'Nothing more to do. The patient can reply to ask for a different time; anything else goes to front desk as a note' };
    case 'handing_back':
      return { words: 'Passing the task back to front desk', next: 'Will finish on the next check' };
    case 'handed_back':
      return { words: `With front desk: ${task.handback_reason ?? 'handed back'}`, next: 'Staff action needed. If staff give the task to the agent again it starts over' };
    default:
      return { words: task.state, next: '' };
  }
}
