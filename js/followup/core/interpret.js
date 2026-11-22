// Patient reply -> intent. Rules first, then an optional model, otherwise 'unknown' (the caller hands back).
// Result: { intent: 'optout'|'handoff'|'pick'|'constraints'|'yes'|'unknown', pick?, constraints?, handoffWord?, source }
import { normalise } from './text.js';
import { isOptOut, findHandoffWord, nearOne } from './guard.js';
import { parseConstraints } from './constraints.js';
import { friendly } from './time.js';

export const LONG_REPLY_CHARS = 500;

const FILLER = new Set([
  'option', 'number', 'num', 'no', 'please', 'pls', 'plz', 'thanks', 'thank', 'you', 'ok', 'okay', 'the', 'i', "i'll", 'ill',
  'take', 'go', 'with', 'works', 'work', 'is', 'best', 'for', 'me', "let's", 'lets', 'choose', 'pick', 'would', 'like',
  'prefer', 'want', 'will', 'time', 'slot', 'then', 'that', 'a', 'going', 'book', 'its', "it's",
]);
const PICK_WORD = new Map([
  ['1', 1], ['2', 2], ['3', 3], ['first', 1], ['second', 2], ['third', 3], ['1st', 1], ['2nd', 2], ['3rd', 3],
  ['one', 1], ['two', 2], ['three', 3],
]);
const YES = new Set(['yes', 'y', 'yep', 'yeah', 'yup', 'ok', 'okay', 'sure', 'sounds good', 'fine', 'great', 'perfect', 'oui', 'yes please', 'ok thanks', 'okay thanks', '\u{1F44D}']);
const NO = [
  // OTHER, "other times", "none", "none of these": a request for three different times
  /^(?:other|others|other one|other ones|none|neither|something else|another time|another one)$/, /\b(?:other|different|another|new|more) (?:times?|options?|slots?|dates?|days?)\b/, /\bnone of (?:these|the above)\b/,
  /^(?:no|n|nope|nah|non)(?: thanks| thank you)?$/, /\bnone of (?:them|those|these)\b/, /\b(?:cant|can't|cannot|could not|couldn't) make (?:any|it|them)\b/,
  /\b(?:doesn't|doesnt|does not|dont|don't|do not) work\b/, /\bnone (?:work|works|suit|suits)\b/, /^\u{1F44E}$/u,
];

function pickFrom(n) {
  const all = n.split(' ').filter(Boolean);
  if (!all.length || all.length > 7) return null;
  const isFiller = (t) => FILLER.has(t) || nearOne(t, 'option') || nearOne(t, 'number');
  let tokens = all.filter((t) => !isFiller(t));
  if (tokens.length > 1) tokens = tokens.filter((t) => t !== 'one');
  return tokens.length === 1 && PICK_WORD.has(tokens[0]) ? PICK_WORD.get(tokens[0]) : null;
}

function rules(text, ctx) {
  const raw = String(text ?? '');
  const n = normalise(raw);
  if (isOptOut(raw)) return { intent: 'optout' };
  if (raw.trim().length > LONG_REPLY_CHARS) return { intent: 'handoff', handoffWord: 'long message' };
  const word = findHandoffWord(raw);
  if (word) return { intent: 'handoff', handoffWord: word };
  if (!n && !/[\u{1F44D}\u{1F44E}]/u.test(raw)) return { intent: 'unknown', reason: 'empty' };

  const pick = pickFrom(n);
  if (pick) return { intent: 'pick', pick };

  const constraints = parseConstraints(raw, ctx);
  if (Object.keys(constraints).length) return { intent: 'constraints', constraints };

  const t = raw.trim().toLowerCase().replace(/[.!]+$/, '');
  if (NO.some((re) => re.test(n) || re.test(t))) return { intent: 'constraints', constraints: {}, declined: true };
  if (YES.has(n) || YES.has(t) || (n.length >= 3 && !n.includes(' ') && nearOne(n, 'yes'))) return { intent: 'yes' };
  return { intent: 'unknown' };
}

/**
 * @param {string} text  untrusted reply text
 * @param {{offers: {start: string, date?: string}[], today: string, llm?: {enabled: boolean, classify: Function}}} ctx
 */
export async function interpret(text, ctx) {
  const ruled = rules(text, ctx);
  if (ruled.intent !== 'unknown' || ruled.reason === 'empty' || !ctx.llm?.enabled) return { ...ruled, source: 'rules' };
  const out = await ctx.llm.classify({ text: String(text), offers: ctx.offers.map((o) => friendly(o.start)) });
  if (out.intent === 'unknown') return { intent: 'unknown', source: 'rules' };
  return { ...out, source: 'llm' };
}
