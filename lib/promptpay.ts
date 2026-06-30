// Thai-QR payment payload helpers.
//
// Only a merchant's static Thai-QR is supported (e.g. the QR exported from
// KBank's "K SHOP" app — a Tag 30 Bill Payment payload). We keep the merchant's
// Biller ID / Ref exactly as-is and only inject the amount, so money still lands
// in the same K SHOP merchant wallet. (The personal phone / national-id
// PromptPay proxy flow was removed.)

// ── EMVCo CRC-16 (CCITT/XModem: poly 0x1021, init 0xFFFF, no reflection) ──────
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ── EMVCo TLV parse / serialize (top level) ──────────────────────────────────
// Every field is id(2) + length(2, decimal) + value(length). Lengths are at
// most 99, so a 2-digit length always fits.
type TlvField = { id: string; value: string };

function parseEmv(payload: string): TlvField[] {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) throw new Error("EMV_TRUNCATED");
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len)) throw new Error("EMV_BAD_LENGTH");
    const end = i + 4 + len;
    if (end > payload.length) throw new Error("EMV_OVERRUN");
    fields.push({ id, value: payload.slice(i + 4, end) });
    i = end;
  }
  return fields;
}

function serializeEmv(fields: TlvField[]): string {
  return fields
    .map((f) => f.id + f.value.length.toString().padStart(2, "0") + f.value)
    .join("");
}

const ID_POI = "01"; // Point of Initiation Method
const ID_AMOUNT = "54"; // Transaction Amount
const ID_CRC = "63"; // CRC
const POI_DYNAMIC = "12"; // amount-locked (vs "11" = static, customer types amount)

/**
 * Turn a static merchant Thai-QR into a dynamic, amount-locked copy:
 * insert Tag 54 (amount), flip the Point of Initiation Method to dynamic,
 * and recompute the CRC. The merchant account templates (Tag 30/31 — Biller
 * ID, Ref1, Ref2) are preserved byte-for-byte.
 */
export function injectAmount(basePayload: string, amountThb: number): string {
  const fields = parseEmv(basePayload.replace(/\s/g, "")).filter(
    (f) => f.id !== ID_CRC && f.id !== ID_AMOUNT,
  );

  const poi = fields.find((f) => f.id === ID_POI);
  if (poi) poi.value = POI_DYNAMIC;

  // Insert the amount in canonical ascending-tag order (after 53, before 58…).
  const amountField: TlvField = { id: ID_AMOUNT, value: amountThb.toFixed(2) };
  const at = fields.findIndex((f) => Number(f.id) > Number(ID_AMOUNT));
  if (at === -1) fields.push(amountField);
  else fields.splice(at, 0, amountField);

  const body = serializeEmv(fields) + ID_CRC + "04";
  return body + crc16(body);
}

/**
 * Validate a pasted Thai-QR / PromptPay merchant payload: well-formed TLV,
 * carries a personal (29) or merchant (30) account template, and the trailing
 * CRC checks out. Whitespace is ignored.
 */
export function isValidThaiQr(payload: string): boolean {
  const clean = payload.replace(/\s/g, "");
  if (!clean.startsWith("000201")) return false;
  let fields: TlvField[];
  try {
    fields = parseEmv(clean);
  } catch {
    return false;
  }
  const last = fields[fields.length - 1];
  if (!last || last.id !== ID_CRC || last.value.length !== 4) return false;
  if (!fields.some((f) => f.id === "29" || f.id === "30")) return false;
  return crc16(clean.slice(0, -4)) === last.value.toUpperCase();
}

/**
 * The single operator's own K SHOP merchant QR, used as the default receiver so
 * tournaments don't need it re-entered each time. Sourced from env (not code) to
 * keep the shop's Biller ID / Ref out of the public repo. Empty string when unset
 * → the admin must paste the shop's Thai-QR into the tournament form.
 */
export const DEFAULT_MERCHANT_QR =
  process.env.NEXT_PUBLIC_DEFAULT_MERCHANT_QR ?? "";

/**
 * Build the amount-locked QR payload from a tournament's merchant Thai-QR.
 * `value` is the merchant's static QR (Tag 30 Bill Payment); we only inject the
 * amount so the money still lands in the same K SHOP wallet.
 */
export function buildPromptPayPayload(value: string, amountThb: number): string {
  return injectAmount(value, amountThb);
}
