import { describe, expect, it, vi } from "vitest";
import { isTransientError, withRetry } from "@/lib/retry";

describe("isTransientError", () => {
  it("treats a failed fetch (TypeError) as transient", () => {
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("never retries a deliberate abort", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isTransientError(abort)).toBe(false);
  });

  it("reads a numeric status off either common field", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ statusCode: 429 })).toBe(true);
    expect(isTransientError({ status: 500 })).toBe(true);
  });

  it("does not retry client errors that will fail again", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError({ status: 409 })).toBe(false);
  });

  it("recognises transient failures described only in the message", () => {
    expect(isTransientError(new Error("Load failed"))).toBe(true);
    expect(isTransientError(new Error("NetworkError when attempting to fetch"))).toBe(true);
    expect(isTransientError(new Error("request timed out"))).toBe(true);
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("rate limit exceeded"))).toBe(true);
    expect(isTransientError(new Error("Service Unavailable"))).toBe(true);
  });

  it("recognises a status embedded in the message text", () => {
    expect(isTransientError(new Error("HTTP 503"))).toBe(true);
    expect(isTransientError(new Error("server responded 502"))).toBe(true);
  });

  it("leaves business errors alone — retrying them just repeats the failure", () => {
    expect(isTransientError(new Error("INSUFFICIENT_SEATS"))).toBe(false);
    expect(isTransientError(new Error("RANK_NOT_ELIGIBLE"))).toBe(false);
    expect(isTransientError(new Error("PROMO_EXPIRED"))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and returns the eventual success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow(
      "Failed to fetch",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("INSUFFICIENT_SEATS"));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(
      "INSUFFICIENT_SEATS",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never even starts when already cancelled", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      withRetry(fn, { baseDelayMs: 1, isCancelled: () => true }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("stops retrying once the caller cancels mid-flight", async () => {
    // The useLiveQuery pattern: a component unmounts (or a newer request
    // supersedes this one) while a retry is pending.
    let cancelled = false;
    const fn = vi.fn().mockImplementation(() => {
      cancelled = true;
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    await expect(
      withRetry(fn, { baseDelayMs: 1, isCancelled: () => cancelled }),
    ).rejects.toThrow("Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
