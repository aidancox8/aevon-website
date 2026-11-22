// Every patient-facing message in one place. Plain and human: written the way a clinic would write to a patient.
// First messages carry the patient's first name, the clinic name, that this is an automated assistant, the doctor,
// the words "follow-up visit" and nothing else about why, three numbered times, how to ask for other times and
// the STOP line. Nothing here ever includes the reason for the visit or anything from the task text.
// Text messages use GSM-7 characters only (no curly quotes, no dashes other than the plain hyphen), so a message
// is never forced into the 70-character encoding. A first text is two segments; clarity matters more than one segment.
import { friendlyAt } from '../core/time.js';

const phoneNote = (mode) => (mode === 'phone' ? ' by phone' : '');
const greet = (name) => (name ? `Hi ${name}, ` : 'Hello, ');
const greetEmail = (name) => (name ? `Hi ${name},` : 'Hello,');
const at = (o) => friendlyAt(o.start);
const newTimes = (n) => (n === 1 ? 'one new time' : 'two new times');
const many = (n) => (n === 1 ? 'one time' : n === 2 ? 'two times' : `${n} times`);
const numbers = (n) => (n <= 1 ? '1' : n === 2 ? '1 or 2' : '1, 2 or 3');
const callUs = (phone, lead = 'You can also call us at') => (phone ? ` ${lead} ${phone}.` : '');

/** "Reply 1 for Wed Dec 30 at 9:00am, 2 for Thu Dec 31 at 9:00am, or 3 for Fri Jan 1 at 1:00pm." */
function choices(offers) {
  const parts = offers.map((o, i) => `${i + 1} for ${at(o)}`);
  if (parts.length === 1) return `Reply ${parts[0]}.`;
  if (parts.length === 2) return `Reply ${parts[0]} or ${parts[1]}.`;
  return `Reply ${parts.slice(0, -1).join(', ')}, or ${parts.at(-1)}.`;
}
const stacked = (offers) => offers.map((o, i) => `${i + 1}) ${at(o)}`).join('\n');

const OTHER_SMS = 'Reply OTHER for different times, or STOP to opt out.';
const fewNote = (offers, word = 'open right now') => (offers.length < 3 ? ` We only have ${many(offers.length)} ${word}.` : '');

const SMS = {
  offer: (v) => `${greet(v.firstName)}this is the automated assistant at ${v.clinic}. ${v.doctor} would like to see you for a follow-up visit${phoneNote(v.mode)}.${fewNote(v.offers)} ${choices(v.offers)} ${OTHER_SMS}`,
  nudge: (v) => (v.nudgeNo === 2
    ? `${greet(v.firstName)}we have not heard back about your follow-up visit with ${v.doctor} at ${v.clinic} (automated assistant). ${choices(v.offers)} ${OTHER_SMS}`
    : `${greet(v.firstName)}this is a reminder from the automated assistant at ${v.clinic}. ${v.doctor} would like to see you for a follow-up visit${phoneNote(v.mode)}. ${choices(v.offers)} ${OTHER_SMS}`),
  more: (v) => (v.offers.length < 3
    ? `Sorry, we only have ${newTimes(v.offers.length)} open with ${v.doctor}${phoneNote(v.mode)}. ${choices(v.offers)} If none of these work, reply OTHER and the clinic will call you, or reply STOP to opt out.`
    : `Here are three different times with ${v.doctor}${phoneNote(v.mode)}. ${choices(v.offers)} ${OTHER_SMS}`),
  taken: (v) => `Sorry, that time was just taken. ${v.offers.length < 3 ? `We only have ${many(v.offers.length)} left with ${v.doctor}${phoneNote(v.mode)}.` : `Here are new times with ${v.doctor}${phoneNote(v.mode)}.`} ${choices(v.offers)} ${OTHER_SMS}`,
  confirm: (v) => `${greet(v.firstName)}you are booked for a follow-up visit${phoneNote(v.mode)} with ${v.doctor} at ${v.clinic} on ${friendlyAt(v.booked)}. Reply CHANGE if you need a different time.`,
  confirm_ask: (v) => `Just to confirm: ${friendlyAt(v.pick)} with ${v.doctor}${phoneNote(v.mode)}. Reply C to confirm, or NO for other times.`,
  reschedule: (v) => `No problem. Your visit on ${friendlyAt(v.booked)} stays booked until you pick a new time.${fewNote(v.offers)} ${choices(v.offers)} Reply KEEP to leave it as it is, or OTHER for different times.`,
  moved: (v) => `Done. Your follow-up visit${phoneNote(v.mode)} with ${v.doctor} is now on ${friendlyAt(v.booked)}, and your earlier time is cancelled. Reply CHANGE if you need a different time.`,
  kept: (v) => `Your follow-up visit with ${v.doctor} stays booked for ${friendlyAt(v.booked)}.`,
  optout_confirm: (v) => `You are opted out and will get no more messages from ${v.clinic}. If you need us, please call${v.phone ? ` ${v.phone}` : ' the clinic'}.`,
  handoff_reply: (v) => `Thanks. We have passed your message to the team at ${v.clinic} and someone will call you${v.phone ? `, or you can call us at ${v.phone}` : ''}.`,
  clarify: (v) => `Sorry, which time works for you? Reply ${numbers(v.offers?.length ?? 3)} to pick one, OTHER for different times, or tell us which days suit you.${callUs(v.phone)}`,
  post_booking: (v) => `Thanks. Your visit is still booked for ${friendlyAt(v.booked)}. We have passed your message to ${v.clinic} and someone will call you${v.phone ? `, or you can call us at ${v.phone}` : ''}.`,
};

const SIGN = (clinic) => `\n\nThis message is from an automated assistant at ${clinic}.`;
const STOP_EMAIL = '\n\nReply STOP to opt out of these emails.';
const EMAIL_PICK = 'Please reply with 1, 2 or 3 and we will book it. If none of these suit you, reply OTHER for different times, or tell us which days or times work.';

const EMAIL = {
  offer: (v) => ({
    subject: `Appointment times with ${v.doctor} for your follow-up visit`,
    body: `${greetEmail(v.firstName)}\n\nThis is the automated assistant at ${v.clinic}. ${v.doctor} would like to see you for a follow-up visit${phoneNote(v.mode)}. ${v.offers.length < 3 ? `We only have ${many(v.offers.length)} open right now:` : 'These times are open:'}\n\n${stacked(v.offers)}\n\n${EMAIL_PICK}${STOP_EMAIL}${SIGN(v.clinic)}`,
  }),
  nudge: (v) => ({
    subject: `Reminder: your follow-up visit with ${v.doctor}`,
    body: v.nudgeNo === 2
      ? `${greetEmail(v.firstName)}\n\nWe have not heard back about your follow-up visit with ${v.doctor} at ${v.clinic}. These times are still open:\n\n${stacked(v.offers)}\n\n${EMAIL_PICK} If we do not hear from you, the clinic may call you.${STOP_EMAIL}${SIGN(v.clinic)}`
      : `${greetEmail(v.firstName)}\n\nThis is a reminder from the automated assistant at ${v.clinic}. ${v.doctor} would like to see you for a follow-up visit${phoneNote(v.mode)}. These times are still open:\n\n${stacked(v.offers)}\n\n${EMAIL_PICK}${STOP_EMAIL}${SIGN(v.clinic)}`,
  }),
  more: (v) => ({
    subject: `Different times for your follow-up visit with ${v.doctor}`,
    body: `${greetEmail(v.firstName)}\n\n${v.offers.length < 3 ? `Sorry, we only have ${newTimes(v.offers.length)} open with ${v.doctor}${phoneNote(v.mode)}:` : `Here are three different times with ${v.doctor}${phoneNote(v.mode)}:`}\n\n${stacked(v.offers)}\n\n${v.offers.length < 3 ? 'Please reply with the number you would like. If none of these work, reply OTHER and the clinic will call you.' : EMAIL_PICK}${STOP_EMAIL}${SIGN(v.clinic)}`,
  }),
  taken: (v) => ({
    subject: `New times for your follow-up visit with ${v.doctor}`,
    body: `${greetEmail(v.firstName)}\n\nSorry, that time was just taken. ${v.offers.length < 3 ? `We only have ${many(v.offers.length)} left with ${v.doctor}${phoneNote(v.mode)}:` : `Here are new times with ${v.doctor}${phoneNote(v.mode)}:`}\n\n${stacked(v.offers)}\n\n${EMAIL_PICK}${STOP_EMAIL}${SIGN(v.clinic)}`,
  }),
  confirm: (v) => ({
    subject: 'Your follow-up visit is booked',
    body: `${greetEmail(v.firstName)}\n\nYou are booked for a follow-up visit${phoneNote(v.mode)}:\n\nDate and time: ${friendlyAt(v.booked)}\nDoctor: ${v.doctor}\nClinic: ${v.clinic}\n\nReply CHANGE if you need a different time.${SIGN(v.clinic)}`,
  }),
  confirm_ask: (v) => ({
    subject: 'Please confirm your time',
    body: `Just to confirm: ${friendlyAt(v.pick)} with ${v.doctor}${phoneNote(v.mode)}. Reply C to confirm, or NO for other times.${SIGN(v.clinic)}`,
  }),
  reschedule: (v) => ({
    subject: `New times for your follow-up visit with ${v.doctor}`,
    body: `${greetEmail(v.firstName)}\n\nNo problem. Your visit on ${friendlyAt(v.booked)} stays booked until you pick a new time. ${v.offers.length < 3 ? `We only have ${many(v.offers.length)} open right now:` : 'These times are open:'}\n\n${stacked(v.offers)}\n\nReply with the number you would like, KEEP to leave your visit as it is, or OTHER for different times.${STOP_EMAIL}${SIGN(v.clinic)}`,
  }),
  moved: (v) => ({
    subject: 'Your follow-up visit has moved',
    body: `${greetEmail(v.firstName)}\n\nYour follow-up visit${phoneNote(v.mode)} has moved, and your earlier time is cancelled:\n\nDate and time: ${friendlyAt(v.booked)}\nDoctor: ${v.doctor}\nClinic: ${v.clinic}\n\nReply CHANGE if you need a different time.${SIGN(v.clinic)}`,
  }),
  kept: (v) => ({
    subject: 'Your follow-up visit is unchanged',
    body: `${greetEmail(v.firstName)}\n\nYour follow-up visit with ${v.doctor} stays booked for ${friendlyAt(v.booked)}.${SIGN(v.clinic)}`,
  }),
  optout_confirm: (v) => ({
    subject: 'You are opted out',
    body: `You are opted out and will get no more messages from ${v.clinic}. If you need us, please call${v.phone ? ` ${v.phone}` : ' the clinic'}.${SIGN(v.clinic)}`,
  }),
  handoff_reply: (v) => ({
    subject: `We got your message at ${v.clinic}`,
    body: `Thanks. We have passed your message to the team at ${v.clinic} and someone will call you${v.phone ? `, or you can call us at ${v.phone}` : ''}.${SIGN(v.clinic)}`,
  }),
  clarify: (v) => ({
    subject: 'Which time works for you?',
    body: `Sorry, which time works for you? Reply ${numbers(v.offers?.length ?? 3)} to pick one, OTHER for different times, or tell us which days or times suit you.${callUs(v.phone)}${SIGN(v.clinic)}`,
  }),
  post_booking: (v) => ({
    subject: 'We got your message',
    body: `Thanks. Your visit is still booked for ${friendlyAt(v.booked)}. We have passed your message to ${v.clinic} and someone will call you${v.phone ? `, or you can call us at ${v.phone}` : ''}.${SIGN(v.clinic)}`,
  }),
};

export const MESSAGE_KINDS = Object.keys(SMS);
export const OFFER_KINDS = ['offer', 'more', 'taken', 'reschedule'];

/**
 * @param {string} kind one of MESSAGE_KINDS
 * @param {'sms'|'email'} channel
 * @param {{clinic: string, doctor: string, firstName?: string, phone?: string, offers?: object[], booked?: string, mode?: string, nudgeNo?: number}} vars
 * @returns {{subject: string|null, body: string}}
 */
export function compose(kind, channel, vars) {
  if (!SMS[kind]) throw new TypeError(`Unknown message kind: ${kind}`);
  if (channel === 'sms') return { subject: null, body: SMS[kind](vars) };
  if (channel === 'email') return EMAIL[kind](vars);
  throw new TypeError(`Unknown channel: ${channel}`);
}
