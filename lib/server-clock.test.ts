import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasServerClock,
  noteServerNow,
  resetServerClock,
  serverNowMs,
} from "./server-clock";

afterEach(() => {
  resetServerClock();
  vi.useRealTimers();
});

describe("server-clock", () => {
  it("falls back to the device clock until a server time is seen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    expect(hasServerClock()).toBe(false);
    expect(serverNowMs()).toBe(Date.now());
  });

  it("corrects a device clock that runs slow", () => {
    vi.useFakeTimers();
    // Device believes it is 10:00; the server says 10:05. The hold's expiresAt
    // is on the server's clock, so a slow device must be pushed forward or it
    // shows five minutes that do not exist.
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    noteServerNow("2026-09-15T10:05:00.000Z");
    expect(hasServerClock()).toBe(true);
    expect(serverNowMs()).toBe(Date.parse("2026-09-15T10:05:00.000Z"));
  });

  it("corrects a device clock that runs fast", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:10:00.000Z"));
    noteServerNow("2026-09-15T10:00:00.000Z");
    expect(serverNowMs()).toBe(Date.parse("2026-09-15T10:00:00.000Z"));
  });

  it("keeps advancing in real time once the offset is known", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    noteServerNow("2026-09-15T10:05:00.000Z");
    vi.advanceTimersByTime(30_000);
    expect(serverNowMs()).toBe(Date.parse("2026-09-15T10:05:30.000Z"));
  });

  it("ignores anything that is not a parseable timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    // An older backend returns no serverNow at all. That must not move the
    // clock.
    for (const bad of [undefined, null, "", "not a date", 42, {}, []]) {
      noteServerNow(bad);
      expect(hasServerClock()).toBe(false);
      expect(serverNowMs()).toBe(Date.now());
    }
  });

  it("lets a later reading replace an earlier one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    noteServerNow("2026-09-15T10:05:00.000Z");
    noteServerNow("2026-09-15T10:00:01.000Z");
    expect(serverNowMs()).toBe(Date.parse("2026-09-15T10:00:01.000Z"));
  });
});
