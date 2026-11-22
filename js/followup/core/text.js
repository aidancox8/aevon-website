// Normalisation for untrusted patient text. Never used to build HTML or SQL.
export const MAX_INBOUND_CHARS = 2000;

/** Trim, drop control characters and cap the length. */
export function clean(input, max = MAX_INBOUND_CHARS) {
  return String(input ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

/** Lower case, accents removed, keycap emoji turned into digits, punctuation to spaces. */
export function normalise(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)️?⃣/g, '$1')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'+ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
