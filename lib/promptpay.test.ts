import { describe, expect, it } from "vitest";
import {
  injectAmount,
  isValidThaiQr,
  originalMerchantQr,
} from "@/lib/promptpay";

// An independent CRC-16/CCITT-FALSE, anchored to the algorithm's published
// check value below. Without it these tests could only confirm that the module
// agrees with itself — and a wrong-but-self-consistent CRC produces a QR that
// every banking app refuses to scan, i.e. nobody can pay.
function refCrc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (id: string, value: string) =>
  id + String(value.length).padStart(2, "0") + value;

/** A well-formed static K SHOP-style Thai-QR (Tag 30 Bill Payment). */
function makeQr(extra = "") {
  const merchant =
    tlv("00", "A000000677010112") + tlv("01", "004123456789012") + tlv("02", "TESUJI01");
  const body =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("30", merchant) +
    tlv("53", "764") +
    extra +
    tlv("58", "TH") +
    "6304";
  return body + refCrc16(body);
}

describe("refCrc16 (test helper)", () => {
  it("matches the published CRC-16/CCITT-FALSE check value", () => {
    expect(refCrc16("123456789")).toBe("29B1");
  });
});

describe("isValidThaiQr", () => {
  it("accepts a well-formed merchant QR", () => {
    expect(isValidThaiQr(makeQr())).toBe(true);
  });

  it("ignores whitespace", () => {
    const qr = makeQr();
    expect(isValidThaiQr(` ${qr.slice(0, 10)}\n${qr.slice(10)} `)).toBe(true);
  });

  it("rejects a payload whose CRC does not check out", () => {
    const qr = makeQr();
    const tampered = qr.slice(0, -4) + (qr.endsWith("0000") ? "1111" : "0000");
    expect(isValidThaiQr(tampered)).toBe(false);
  });

  it("rejects a payload edited after its CRC was computed", () => {
    const qr = makeQr();
    // Flip a digit inside the Biller ID but keep the original trailing CRC.
    const edited = qr.replace("004123456789012", "004123456789099");
    expect(edited).not.toBe(qr);
    expect(isValidThaiQr(edited)).toBe(false);
  });

  it("rejects a payload with no account template (tag 29 or 30)", () => {
    const body = tlv("00", "01") + tlv("01", "11") + tlv("53", "764") + tlv("58", "TH") + "6304";
    expect(isValidThaiQr(body + refCrc16(body))).toBe(false);
  });

  it("rejects anything not starting with the EMVCo header", () => {
    expect(isValidThaiQr("000202" + makeQr().slice(6))).toBe(false);
    expect(isValidThaiQr("")).toBe(false);
    expect(isValidThaiQr("not a qr at all")).toBe(false);
  });

  it("rejects truncated TLV rather than throwing", () => {
    expect(isValidThaiQr(makeQr().slice(0, 20))).toBe(false);
    expect(isValidThaiQr("00020101")).toBe(false);
  });
});

describe("injectAmount", () => {
  it("produces a payload that still validates", () => {
    expect(isValidThaiQr(injectAmount(makeQr(), 350))).toBe(true);
  });

  it("writes the amount as tag 54 with two decimals", () => {
    expect(injectAmount(makeQr(), 350)).toContain("5406350.00");
    expect(injectAmount(makeQr(), 1250.5)).toContain("54071250.50");
    expect(injectAmount(makeQr(), 0)).toContain("54040.00");
  });

  it("preserves the merchant's Tag 30 byte-for-byte", () => {
    // Money must still land in the same K SHOP wallet after injection.
    const merchant =
      "30" +
      "51" +
      tlv("00", "A000000677010112") +
      tlv("01", "004123456789012") +
      tlv("02", "TESUJI01");
    expect(makeQr()).toContain(merchant);
    expect(injectAmount(makeQr(), 350)).toContain(merchant);
  });

  it("leaves the POI on static (11) so K PLUS keeps accepting it", () => {
    expect(injectAmount(makeQr(), 350)).toContain("010211");
  });

  it("replaces an existing amount instead of adding a second tag 54", () => {
    const withAmount = injectAmount(makeQr(), 100);
    const reinjected = injectAmount(withAmount, 250);
    expect(reinjected.match(/54\d{2}\d+\.\d{2}/g)?.length ?? 0).toBe(1);
    expect(reinjected).toContain("5406250.00");
    expect(reinjected).not.toContain("100.00");
    expect(isValidThaiQr(reinjected)).toBe(true);
  });

  it("keeps tags in ascending order (54 after 53, before 58)", () => {
    const out = injectAmount(makeQr(), 350);
    expect(out.indexOf("5303764")).toBeLessThan(out.indexOf("5406350.00"));
    expect(out.indexOf("5406350.00")).toBeLessThan(out.indexOf("5802TH"));
  });

  it("tolerates whitespace in the stored payload", () => {
    const qr = makeQr();
    const spaced = `${qr.slice(0, 12)} ${qr.slice(12)}`;
    expect(injectAmount(spaced, 350)).toBe(injectAmount(qr, 350));
  });
});

describe("originalMerchantQr", () => {
  it("returns the payload untouched when it is valid and space-free", () => {
    const qr = makeQr();
    expect(originalMerchantQr(`  ${qr}  `)).toBe(qr);
  });

  it("returns null for internal whitespace, so the fallback is simply not offered", () => {
    const qr = makeQr();
    expect(originalMerchantQr(`${qr.slice(0, 10)} ${qr.slice(10)}`)).toBeNull();
  });

  it("returns null for an invalid payload", () => {
    expect(originalMerchantQr("000201-garbage")).toBeNull();
    expect(originalMerchantQr("")).toBeNull();
  });
});
