// Which channel to use for a patient: text if consented, else email.
/** @returns {'sms'|'email'|null} */
export function pickChannel(consent, task, { preferEmail = false } = {}) {
  const sms = consent.allows(task.patient_id, 'sms') && Boolean(task.mobile);
  const email = consent.allows(task.patient_id, 'email') && Boolean(task.email);
  if (preferEmail && email) return 'email';
  if (sms) return 'sms';
  return email ? 'email' : null;
}

/** Channel for a reply to an inbound message: the same one if consented, else the usual choice. */
export function replyChannel(consent, task, inboundChannel) {
  const addr = inboundChannel === 'sms' ? task.mobile : task.email;
  if (addr && consent.allows(task.patient_id, inboundChannel)) return inboundChannel;
  return pickChannel(consent, task);
}

export const channelWord = (channel) => (channel === 'sms' ? 'text' : 'email');
