// Normalising contact addresses so replies can be matched to patients.
/** Digits only, North American numbers reduced to ten digits. Returns null if it does not look like a phone number. */
export function normalisePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits.slice(-10);
}

/** Lower-cased address from "Name <a@b.c>" or "a@b.c". Returns null if it does not look like one. */
export function normaliseEmail(input) {
  const s = String(input ?? '').trim();
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(s);
  const addr = (angle ? angle[1] : s).toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) ? addr : null;
}
