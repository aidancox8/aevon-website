// Find three times and queue the message that offers them, saved together in one transaction.
import { findOffers } from './slots.js';
import { transaction } from '../db.js';
import { attemptKey } from './outbound.js';

/**
 * `exclude` lists times that must not be offered again. The task's `offered` column keeps every time sent so far.
 * `patch` holds task fields that must change only if the offers go out (round counters), so a failed EMR call can be retried without side effects.
 * @returns {Promise<'sent'|'none'|'blocked'>} 'none' = no open times match, 'blocked' = safety check stopped the message
 */
export async function sendOffers(svc, task, { kind, channel, exclude = [], patch = {} }) {
  const offers = await findOffers({
    emr: svc.emr, providerId: task.provider_id, target: task.target_date, minutes: task.minutes,
    constraints: task.constraints, settings: svc.settings.get(), nowMs: svc.clock.now(), exclude,
  });
  if (!offers.length) return 'none';
  const outcome = transaction(svc.db, () => {
    const queued = svc.outbound.queue({
      task, kind, channel, vars: { offers },
      dedupeKey: `${kind}:${task.task_id}:${task.rounds}:${task.taken_count}${attemptKey(task)}`,
    });
    if (queued.status === 'blocked') return queued;
    const offered = [...new Set([...(task.offered ?? []), ...offers.map((o) => o.start)])];
    svc.tasks.update(task.task_id, { ...patch, offers, offered, state: 'awaiting', channel, nudges: 0, first_sent_at: null });
    return queued;
  });
  if (outcome.status === 'blocked') return 'blocked';
  svc.audit.record({
    taskId: task.task_id, action: 'offers_chosen',
    before: { kind, round: task.rounds }, after: { offers: offers.map((o) => o.start) },
  });
  return 'sent';
}
