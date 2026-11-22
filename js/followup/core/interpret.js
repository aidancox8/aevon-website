// Patient reply -> intent. Rules first, then an optional model, otherwise 'unknown' (the caller hands back).
// Result: { intent: 'optout'|'handoff'|'pick'|'constraints'|'yes'|'unknown', pick?, constraints?, handoffWord?, source }
import { normalise } from './text.js';
import { isOptOut, findHandoffWord, nearOne } from './guard.js';
import { parseConstraints } from './constraints.js';
import { friendly, weekdayOf } from './time.js';

export const LONG_REPLY_CHARS = 500;

const FILLER = new Set([
  'option', 'number', 'num', 'no', 'please', 'pls', 'plz', 'thanks', 'thank', 'you', 'ok', 'okay', 'the', 'i', "i'll", 'ill',
  'take', 'go', 'with', 'works', 'work', 'is', 'best', 'for', 'me', "let's", 'lets', 'choose', 'pick', 'would', 'like',
  'prefer', 'want', 'will', 'time', 'slot', 'then', 'that', 'a', 'going', 'book', 'its', "it's", 'actually', 'sorry', 'make', 'it', 'do', 'can', 'we', 'instead', 'maybe',
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
  /\b(?:doesn't|doesnt|does not|dont|don't|do not|wont|won't|will not) (?:work|suit|fit)\b/,
  // "more", "any more?", "show me more", "anything else", "what else do you have"
  /^(?:more|any ?more|next|else)(?: please| pls| thanks)?$/, /\b(?:any|some|show me|give me|send me|send|a few|few|got|have) more\b/, /\bmore (?:please|pls)\b/,
  /\b(?:anything|something|what|anywhere) else\b/, /\bwhat other\b/,
  // "I can't do any of those", "nothing works", "no good", "I'm busy then", "I'm away"
  /\b(?:cant|can't|cannot|couldn't|could not|wont|won't|unable to) (?:do|make|come|attend|manage|be there)\b/,
  /\b(?:none|nothing|neither|not one)\b.*\b(?:work|works|good|suit|suits|fit|fits)\b/, /^(?:no good|not good|no luck|not really|not great)$/,
  /\b(?:not|never|won't be|wont be) (?:available|free|around|in town|able)\b/, /\b(?:busy|unavailable|out of town|at work|working|travelling|traveling|on vacation|on holiday)\b/,
  /\btoo (?:early|late)\b/, /\bnone (?:work|works|suit|suits)\b/, /^\u{1F44E}$/u,
];

function pickFrom(n) {
  const all = n.split(' ').filter(Boolean);
  if (!all.length || all.length > 7) return null;
  const isFiller = (t) => FILLER.has(t) || nearOne(t, 'option') || nearOne(t, 'number');
  let tokens = all.filter((t) => !isFiller(t));
  if (tokens.length > 1) tokens = tokens.filter((t) => t !== 'one');
  return tokens.length === 1 && PICK_WORD.has(tokens[0]) ? PICK_WORD.get(tokens[0]) : null;
}

const DAY_WORD = new Map([
  ['sunday', 0], ['sun', 0], ['monday', 1], ['mon', 1], ['tuesday', 2], ['tue', 2], ['tues', 2], ['wednesday', 3], ['wed', 3], ['weds', 3],
  ['thursday', 4], ['thu', 4], ['thur', 4], ['thurs', 4], ['friday', 5], ['fri', 5], ['saturday', 6], ['sat', 6],
]);
// Words that mean the patient is asking for something else, not naming one of the offered times.
const NOT_A_PICK = /\b(?:not|no|except|cant|can't|cannot|other|others|another|different|more|else|instead|later|earlier|sooner|next|following|after|before|only|any|anything|something|week|weeks|or|every)\b/;

/**
 * "the Tuesday one", "9am works", "Wed at 1:15": a reply that names a day or a clock time matching exactly one
 * of the offered times is a pick. Anything that matches none or several is left to the other rules.
 */
function describedPick(raw, n, offers) {
  if (!offers?.length || NOT_A_PICK.test(n) || n.split(' ').length > 10) return null;
  const days = new Set(n.split(' ').filter((t) => DAY_WORD.has(t)).map((t) => DAY_WORD.get(t)));
  const times = [...raw.toLowerCase().matchAll(/(?<![\d:])(\d{1,2})(?::(\d\d))?\s*(am|pm|a\.m\.?|p\.m\.?)?(?![\d:])/g)]
    .filter((m) => m[2] || m[3])
    .map((m) => ({ h: Number(m[1]), mi: Number(m[2] ?? 0), half: m[3] ? m[3][0] : null }));
  const morning = /\bmorning\b/.test(n);
  const afternoon = /\bafternoon\b/.test(n);
  if (days.size > 1 || times.length > 1 || (morning && afternoon) || (!days.size && !times.length)) return null;
  const hits = [];
  offers.forEach((o, i) => {
    const date = o.date ?? o.start.slice(0, 10);
    const h = Number(o.start.slice(11, 13));
    const mi = Number(o.start.slice(14, 16));
    if (days.size && !days.has(weekdayOf(date))) return;
    if (morning && h >= 12) return;
    if (afternoon && h < 12) return;
    const t = times[0];
    if (t && (t.mi !== mi || t.h % 12 !== h % 12 || (t.half === 'a' && h >= 12) || (t.half === 'p' && h < 12))) return;
    hits.push(i + 1);
  });
  return hits.length === 1 ? hits[0] : null;
}

// Typos. A word one slip away from a word the rules know is read as that word ("othr", "confrim", "tuseday").
// Short words are too close to other real words for that, so they have a list of their own.
const KNOWN = ['other', 'others', 'confirm', 'change', 'different', 'another', 'reschedule', 'morning', 'mornings', 'afternoon', 'afternoons',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'earlier', 'sooner', 'later', 'cancel', 'option', 'number', 'please', 'thanks'];
const REAL_WORDS = new Set(['mother', 'bother', 'otter', 'ether', 'chance', 'charge', 'changed', 'changes', 'latter', 'layer', 'water', 'laser', 'hater', 'cater', 'eater', 'lager', 'laterz', 'conform', 'confirms', 'sunday', 'canceled', 'cancels', 'numbers', 'options', 'pleased', 'thank']);
const SLIPS = new Map([
  ['non', 'none'], ['noen', 'none'], ['nne', 'none'], ['nonee', 'none'], ['mroe', 'more'], ['moer', 'more'], ['mor', 'more'], ['moree', 'more'],
  ['kep', 'keep'], ['kepe', 'keep'], ['keeep', 'keep'], ['eys', 'yes'], ['yse', 'yes'], ['yess', 'yes'], ['ys', 'yes'], ['yea', 'yes'],
  ['otehr', 'other'], ['ohter', 'other'], ['oter', 'other'], ['confrm', 'confirm'], ['cnfirm', 'confirm'], ['conf', 'confirm'], ['tues', 'tuesday'], ['thurs', 'thursday'], ['tiems', 'times'], ['tmes', 'times'], ['timse', 'times'], ['tims', 'times'],
]);
const fixWord = (t) => {
  if (SLIPS.has(t)) return SLIPS.get(t);
  if (t.length < 4 || REAL_WORDS.has(t) || KNOWN.includes(t)) return t;
  return KNOWN.find((k) => k.length >= 5 && nearOne(t, k)) ?? t;
};
/** Normalised text with likely typos corrected. */
export const loose = (text) => normalise(text).split(' ').map(fixWord).join(' ');

function rules(text, ctx) {
  const raw = String(text ?? '');
  const n = loose(raw);
  if (isOptOut(raw)) return { intent: 'optout' };
  if (raw.trim().length > LONG_REPLY_CHARS) return { intent: 'handoff', handoffWord: 'long message' };
  const word = findHandoffWord(raw);
  if (word) return { intent: 'handoff', handoffWord: word };
  if (!n && !/[\u{1F44D}\u{1F44E}]/u.test(raw)) return { intent: 'unknown', reason: 'empty' };

  const pick = pickFrom(n);
  if (pick) return { intent: 'pick', pick };
  const described = describedPick(raw, n, ctx.offers);
  if (described) return { intent: 'pick', pick: described };

  const constraints = parseConstraints(n, ctx);
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
