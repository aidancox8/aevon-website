// Hand a task back to front desk staff, with a note. Restart safe: the intent is saved first
// (state 'handing_back'), then the EMR is updated, then the state becomes 'handed_back'.
import { clean } from './text.js';
import { attemptKey } from './outbound.js';

const QUOTE_CHARS = 300;

export function buildNote(reason, quote) {
  if (!quote) return reason;
  const q = clean(quote, QUOTE_CHARS).replace(/\s+/g, ' ').replace(/"/g, "'");
  return `${reason}. Patient wrote: "${q}"`;
}

/**
 * @param {object} svc services
 * @param {object} task the agent's task row
 * @param {{reason: string, quote?: string, reply?: 'handoff_reply'|'optout_confirm', replyChannel?: string}} o
 */
export async function handBack(svc, task, { reason, quote = null, reply = null, replyChannel = null }) {
  const note = buildNote(reason, quote);
  svc.audit.record({
    taskId: task.task_id, action: 'handback_decided',
    before: { state: task.state }, after: { state: 'handing_back', reason },
  });
  svc.tasks.update(task.task_id, { state: 'handing_back', handback_reason: reason, handback_note: note });
  if (reply && replyChannel) {
    svc.outbound.queue({ task: svc.tasks.get(task.task_id), kind: reply, channel: replyChannel, dedupeKey: `handback:${task.task_id}${attemptKey(task)}` });
  }
  await continueHandback(svc, svc.tasks.get(task.task_id));
}

export async function continueHandback(svc, task) {
  const { frontDeskUserId } = svc.settings.get();
  const emrTask = await svc.emr.getTask(task.task_id);
  if (emrTask.assigneeId !== frontDeskUserId) {
    await svc.audit.around({
      taskId: task.task_id, action: 'task_reassign',
      before: { assigneeId: emrTask.assigneeId, status: emrTask.status },
    }, async () => {
      await svc.emr.reassignTask(task.task_id, { toUserId: frontDeskUserId, note: task.handback_note });
      return { assigneeId: frontDeskUserId, note: task.handback_note };
    });
  }
  svc.tasks.update(task.task_id, { state: 'handed_back' });
}
