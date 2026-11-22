// Optional second reader for replies the rules cannot read. It posts the reply and the offered times to a small
// server function, which asks a language model to sort the reply into one of the choices the rules already use.
// The model only labels. Everything it returns is checked here again, and anything unexpected becomes 'unknown',
// so the engine falls back to asking the patient again and then handing the task to staff.
import { addDays } from './time.js';

const TIMEOUT_MS = 11000;

/**
 * @param {string} url the classify function
 * @param {typeof fetch} [fetchImpl]
 * @returns {{enabled: boolean, classify: (q: {text: string, offers: string[], raw?: object[], booked?: string}) => Promise<object>}}
 */
export function createRemoteClassifier(url, fetchImpl = globalThis.fetch) {
  async function classify({ text, offers = [], raw = [], booked = '' }) {
    let out;
    try {
      const r = await fetchImpl(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: String(text).slice(0, 300), offers: offers.slice(0, 3), booked }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) return { intent: 'unknown' };
      out = await r.json();
    } catch {
      return { intent: 'unknown' };
    }
    switch (out?.intent) {
      case 'pick':
        return Number.isInteger(out.pick) && out.pick >= 1 && out.pick <= offers.length ? { intent: 'pick', pick: out.pick } : { intent: 'unknown' };
      case 'confirm':
        return { intent: 'yes' };
      case 'keep':
        return { intent: 'keep' };
      case 'handoff':
      case 'optout': // only the exact opt-out words in the rules may withdraw consent; a model's guess goes to staff
        return { intent: 'handoff', handoffWord: 'read by the model as needing staff' };
      case 'change':
      case 'other_times': {
        const constraints = {};
        if (out.partOfDay === 'morning' || out.partOfDay === 'afternoon') constraints.partOfDay = out.partOfDay;
        const days = (Array.isArray(out.weekdays) ? out.weekdays : []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 5);
        if (days.length && days.length < 5) constraints.weekdays = [...new Set(days)].sort();
        if (out.phone === true) constraints.mode = 'phone';
        const dates = raw.map((o) => o.date ?? o.start?.slice(0, 10)).filter(Boolean).sort();
        if (dates.length && out.direction === 'later') constraints.notBefore = addDays(dates.at(-1), 1);
        if (dates.length && out.direction === 'sooner') constraints.notAfter = addDays(dates[0], -1);
        return { intent: out.intent === 'change' ? 'change' : 'constraints', constraints, declined: true };
      }
      default:
        return { intent: 'unknown' };
    }
  }
  return { enabled: true, classify };
}
