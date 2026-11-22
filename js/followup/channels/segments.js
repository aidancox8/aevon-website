// How many SMS segments a body needs. GSM-7 holds 160 (153 when split); anything else is UCS-2: 70 (67 when split).
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXTENDED = new Set('^{}\\[~]|€\f');

export function smsSegments(body) {
  let units = 0;
  let gsm = true;
  for (const ch of body) {
    if (GSM_BASIC.has(ch)) units += 1;
    else if (GSM_EXTENDED.has(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) return units <= 160 ? 1 : Math.ceil(units / 153);
  const ucs = body.length;
  return ucs <= 70 ? 1 : Math.ceil(ucs / 67);
}

/** True if every character is in the GSM-7 alphabet (basic or extended), so the message is never sent as 70-character UCS-2. */
export function isGsm7(body) {
  for (const ch of body) if (!GSM_BASIC.has(ch) && !GSM_EXTENDED.has(ch)) return false;
  return true;
}
