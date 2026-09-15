import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveRegWindow, regWindow } from "@/lib/tournament-window";

// This pair decides whether /t/[tid]/register lets anyone in at all, and the
// live tournament's window closes 2026-09-29. An off-by-one at either instant
// either turns registration away while it should be open or keeps taking money
// after it closed, and neither is visible until the boundary is crossed in
// production — so the boundaries are pinned here with a frozen clock.

const OPENS = "2026-09-01T09:00:00+07:00";
const CLOSES = "2026-09-29T23:59:59+07:00";

const published = (over?: { opens?: string; closes?: string }) => ({
  status: "published" as const,
  registrationOpensAt: over?.opens ?? OPENS,
  registrationClosesAt: over?.closes ?? CLOSES,
});

/** Freeze the clock at an instant expressed in UTC. */
function at(utcIso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utcIso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("regWindow", () => {
  it("is 'before' until the opening instant", () => {
    at("2026-09-01T01:59:59.999Z"); // 08:59:59.999 in Bangkok
    expect(regWindow(published())).toBe("before");
  });

  it("is 'open' from the opening instant, inclusive", () => {
    // The opening boundary belongs to the open window: `now < opens`.
    at("2026-09-01T02:00:00.000Z");
    expect(regWindow(published())).toBe("open");
  });

  it("stays 'open' up to the last millisecond before closing", () => {
    at("2026-09-29T16:59:58.999Z"); // 23:59:58.999 in Bangkok
    expect(regWindow(published())).toBe("open");
  });

  it("is 'closed' from the closing instant, inclusive", () => {
    // The closing boundary belongs to the closed window: `now >= closes`.
    at("2026-09-29T16:59:59.000Z");
    expect(regWindow(published())).toBe("closed");
    at("2026-10-01T00:00:00.000Z");
    expect(regWindow(published())).toBe("closed");
  });

  it("reads the same instant however the offset is written", () => {
    // Postgres hands back "+00:00", the admin form posts "+07:00"; both must
    // place the window at the same moment.
    at("2026-09-01T01:59:59.999Z");
    expect(regWindow(published({ opens: "2026-09-01T02:00:00Z" }))).toBe("before");
    expect(
      regWindow(published({ opens: "2026-09-01T02:00:00.000+00:00" })),
    ).toBe("before");
    at("2026-09-01T02:00:00.000Z");
    expect(regWindow(published({ opens: "2026-09-01T02:00:00Z" }))).toBe("open");
  });

  it("reads a timestamp with no offset as the viewer's own local time", () => {
    // Date.parse's rule for a date-TIME with no zone, and the reason every
    // stored value carries one. Only reachable from unsaved admin-form values;
    // asserted against a locally-constructed instant so the expectation holds
    // in any timezone.
    const localNine = new Date(2026, 8, 1, 9, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(localNine.getTime() - 1));
    expect(regWindow(published({ opens: "2026-09-01T09:00:00" }))).toBe("before");
    vi.setSystemTime(localNine);
    expect(regWindow(published({ opens: "2026-09-01T09:00:00" }))).toBe("open");
  });

  it("ignores the window entirely for a draft or a closed tournament", () => {
    at("2026-09-15T05:00:00.000Z");
    expect(regWindow({ ...published(), status: "draft" })).toBe("not_published");
    expect(regWindow({ ...published(), status: "closed" })).toBe("not_published");
  });

  it("never reads an unparseable window as open", () => {
    // Date.parse returns NaN and every comparison against it is false, so this
    // used to fall through to "open": a published row with a blank or
    // malformed close date invited registrations reserve_seats would refuse.
    // A missing close fails CLOSED; a missing open cannot be "before" any
    // meaningful instant, so it reads as not yet published.
    at("2026-09-15T05:00:00.000Z");
    expect(regWindow(published({ closes: "" }))).toBe("closed");
    expect(regWindow(published({ closes: "29/09/2026" }))).toBe("closed");
    expect(regWindow(published({ opens: "", closes: "" }))).toBe("closed");
    expect(regWindow(published({ opens: "not a date" }))).toBe("not_published");
    // A window that is still valid must be unaffected by the guard.
    expect(regWindow(published())).toBe("open");
  });
});

describe("effectiveRegWindow", () => {
  it("calls an admin-closed tournament closed, not unpublished", () => {
    // User-facing copy: "ยังไม่เปิดรับสมัคร" on an event that has already
    // ended would be wrong.
    at("2026-09-15T05:00:00.000Z");
    expect(effectiveRegWindow({ ...published(), status: "closed" })).toBe("closed");
  });

  it("still hides a draft, which the public UI never shows", () => {
    at("2026-09-15T05:00:00.000Z");
    expect(effectiveRegWindow({ ...published(), status: "draft" })).toBe(
      "not_published",
    );
  });

  it("agrees with regWindow for a published tournament", () => {
    at("2026-08-15T05:00:00.000Z");
    expect(effectiveRegWindow(published())).toBe("before");
    at("2026-09-15T05:00:00.000Z");
    expect(effectiveRegWindow(published())).toBe("open");
    at("2026-10-15T05:00:00.000Z");
    expect(effectiveRegWindow(published())).toBe("closed");
  });
});
