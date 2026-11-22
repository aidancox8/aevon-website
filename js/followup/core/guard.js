// Safety checks: opt-out words, hand-off words, and a check that outbound text carries no health details.
import { normalise } from './text.js';

const STOP_TOKENS = new Set(['stop', 'stopall', 'arret', 'arreter', 'arrete', 'unsubscribe', 'desabonner', 'optout']);
const STOP_ONLY = new Set(['end', 'quit', 'cancel all', 'opt out', 'remove me']);
const STOP_PHRASES = [
  /\bopt(?: me)? out\b/, /\bremove me\b/, /\bstop (?:texting|messaging|contacting|emailing|sending)\b/,
  /\bdo not (?:text|contact|message|email)\b/, /\bdon'?t (?:text|contact|message|email)\b/,
  /\bno more (?:texts|messages|emails)\b/, /\barretez\b/,
];

/** Edit distance of at most one, counting a swap of two neighbours as one edit. */
export function nearOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** True if the reply asks us to stop. Handles STOP, ARRET, UNSUBSCRIBE, one-letter typos of STOP. */
export function isOptOut(text) {
  const n = normalise(text);
  if (!n) return false;
  const tokens = n.split(' ');
  if (tokens.some((t) => STOP_TOKENS.has(t))) return true;
  if (STOP_ONLY.has(n)) return true;
  if (STOP_PHRASES.some((re) => re.test(n))) return true;
  return tokens.length === 1 && n.length >= 3 && (nearOne(n, 'stop') || nearOne(n, 'arret'));
}

const HANDOFF = [
  /\bresults?\b/, /\bpain\b/, /\bpainful\b/, /\bbleed\w*/, /\bemergenc\w*/, /\burgent\w*/, /\bmedication\w*/,
  /\bmeds?\b/, /\bprescription\w*/, /\brefill\w*/, /\bchest\b/, /\bsuicid\w*/, /\bbreath\w*/, /\bsymptoms?\b/,
  /\bcall me\b/, /\bcall back\b/, /\bspeak to\b/, /\bspeak with\b/, /\btalk to\b/, /\bworse\b/, /\bhurts?\b/,
  /\bkill myself\b/, /\boverdose\b/,
];

/** Returns the matched hand-off word or phrase, or null. */
export function findHandoffWord(text) {
  const n = normalise(text);
  for (const re of HANDOFF) {
    const m = re.exec(n);
    if (m) return m[0];
  }
  return null;
}

const HEALTH_WORDS = [
  'result', 'diagnos', 'pain', 'bleed', 'medication', 'prescription', 'cancer', 'biopsy', 'blood', 'lab ',
  'symptom', 'infection', 'surgery', 'chest', 'suicid', 'pregnan',
];

/**
 * Outbound check. Returns null when the message is safe, or a short reason.
 * A message must not contain health words, nor the doctor's task text.
 */
export function checkOutbound(body, { taskText = '' } = {}) {
  const b = body.toLowerCase();
  for (const w of HEALTH_WORDS) if (b.includes(w)) return `contains health word "${w.trim()}"`;
  const t = String(taskText).toLowerCase().trim();
  if (t.length >= 5 && b.includes(t)) return 'contains the task text';
  return null;
}
