import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// public/live-assets/judge.js is a classic <script>, not a module, so it cannot
// be imported. It does guard every global behind `typeof window !== 'undefined'`,
// which makes it loadable inside a function scope with stubs injected — enough
// to exercise the offline result queue, which is the piece whose failure mode is
// a judge's submitted result vanishing on venue wifi.
//
// This is deliberately not an end-to-end test of the console: that needs a live
// judge token. It covers the queue's decisions, which is where the data loss was.

const SRC = readFileSync(
  join(__dirname, "..", "public", "live-assets", "judge.js"),
  "utf8",
);

type FakeEl = {
  id: string; textContent: string; className: string; classList: Set<string>;
};

type Item = {
  tid?: string; divId: string; round: string; table: string;
  winner: string; submittedBy: string; remark?: string;
  black?: string; white?: string;
};

function load(opts: { online?: boolean; stored?: unknown } = {}) {
  const store = new Map<string, string>();
  if (opts.stored !== undefined) {
    store.set("tesuji_judge_queue", JSON.stringify(opts.stored));
  }
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  // showToast() and closeMatchArea() are function declarations inside judge.js,
  // so they shadow any injected stub. Hand out a real fake element per id and
  // read the toasts off the #toast node the real showToast writes to.
  const nodes = new Map<string, FakeEl>();
  const el = (id: string): FakeEl => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, textContent: "", className: "", classList: new Set<string>() };
      nodes.set(id, n);
    }
    return n;
  };
  const wrap = (n: FakeEl) => ({
    get textContent() { return n.textContent; },
    set textContent(v: string) {
      n.textContent = v;
      if (n.id === "toast") toasts.push({ msg: v, kind: "" });
    },
    get className() { return n.className; },
    set className(v: string) {
      n.className = v;
      if (n.id === "toast" && toasts.length) {
        toasts[toasts.length - 1].kind = v.replace("toast ", "").trim();
      }
    },
    classList: {
      add: (c: string) => void n.classList.add(c),
      remove: (c: string) => void n.classList.delete(c),
    },
    style: {},
  });
  const toasts: { msg: string; kind: string }[] = [];
  const bar = el("queueBar");
  const document = {
    addEventListener: () => {},
    getElementById: (id: string) => wrap(el(id)),
    body: { classList: { add: () => {}, remove: () => {} } },
  };
  const fetchMock = vi.fn();
  const loadDivData = vi.fn(async () => {});

  // judge.js reads localStorage through common.js's guarded helpers now (a
  // throwing localStorage in a restricted webview used to take the whole
  // console down), so the stubs stand in for those too.
  const _lsGet = (k: string) => store.get(k) ?? null;
  const _lsSet = (k: string, v: string) => { store.set(k, v); return true; };
  const _lsRemove = (k: string) => void store.delete(k);
  const _lsJSON = (k: string, fallback: unknown, validate?: (v: unknown) => boolean) => {
    const raw = _lsGet(k);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return validate && !validate(parsed) ? fallback : parsed;
    } catch { return fallback; }
  };

  const factory = new Function(
    "window", "document", "localStorage", "navigator", "fetch",
    "registerActions", "esc",
    "_lsGet", "_lsSet", "_lsRemove", "_lsJSON",
    `${SRC}
     return {
       enqueueResult, flushQueue, _loadQueue, renderQueueBar, _calcScore,
       queue: () => _queue,
     };`,
  );

  const api = factory(
    // The console is served for ONE tournament (window.__LIVE_TID); queued
    // results remember it so they are never replayed into another one.
    { addEventListener: () => {}, __JUDGE_SECRET: "tok", __LIVE_TID: "t1" },
    document,
    localStorage,
    { onLine: opts.online ?? true },
    fetchMock,
    () => {},
    (s: string) => s,
    _lsGet,
    _lsSet,
    _lsRemove,
    _lsJSON,
  );
  return { api, fetchMock, toasts, bar, store, loadDivData };
}

const item = (over: Partial<Item> = {}): Item => ({
  tid: "t1", divId: "d1", round: "1", table: "5",
  winner: "BLACK", submittedBy: "สมชาย", ...over,
});

const ok = () => ({ status: 200, json: async () => ({ success: true }) });
const gone = () => ({ status: 409, json: async () => ({ code: "MATCH_NOT_FOUND", error: "gone" }) });
const changed = () => ({ status: 409, json: async () => ({ code: "MATCH_CHANGED", error: "moved" }) });
const busy = () => ({ status: 429, json: async () => ({ success: false, error: "Too Many Requests" }) });
const serverErr = () => ({ status: 200, json: async () => ({ error: "BOOM" }) });

describe("judge offline result queue", () => {
  beforeEach(() => vi.useRealTimers());

  it("persists a queued result so it survives a reload", () => {
    const a = load();
    a.api.enqueueResult(item());
    expect(a.api.queue()).toHaveLength(1);
    expect(JSON.parse(a.store.get("tesuji_judge_queue")!)).toHaveLength(1);

    // A fresh page load picks the same result back up.
    const b = load({ stored: JSON.parse(a.store.get("tesuji_judge_queue")!) });
    b.api._loadQueue();
    expect(b.api.queue()).toHaveLength(1);
  });

  it("shows the pending count, and hides the bar when empty", () => {
    const a = load();
    a.api.enqueueResult(item());
    a.api.enqueueResult(item({ table: "6" }));
    expect(a.bar.textContent).toContain("2");
    expect(a.bar.classList.has("hidden")).toBe(false);

    const b = load();
    b.api.renderQueueBar();
    expect(b.bar.classList.has("hidden")).toBe(true);
  });

  it("sends everything queued once the connection is back", async () => {
    const a = load({ stored: [item(), item({ table: "6" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    expect(a.fetchMock).toHaveBeenCalledTimes(2);
    expect(a.api.queue()).toHaveLength(0);
    expect(a.toasts.some((t) => t.msg.includes("2"))).toBe(true);
  });

  it("keeps results when the network is still down — nothing is lost", async () => {
    const a = load({ stored: [item()] });
    a.api._loadQueue();
    a.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await a.api.flushQueue();

    expect(a.api.queue()).toHaveLength(1);
    expect(JSON.parse(a.store.get("tesuji_judge_queue")!)).toHaveLength(1);
  });

  it("does not even try while the device reports itself offline", async () => {
    const a = load({ online: false, stored: [item()] });
    a.api._loadQueue();
    await a.api.flushQueue();
    expect(a.fetchMock).not.toHaveBeenCalled();
    expect(a.api.queue()).toHaveLength(1);
  });

  it("drops a result whose pairing has since been re-uploaded, and says so", async () => {
    // Replaying it would write against a pairing the judge never saw.
    const a = load({ stored: [item({ table: "5" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(gone());

    await a.api.flushQueue();

    expect(a.api.queue()).toHaveLength(0);
    const warned = a.toasts.find((t) => t.kind === "error")!;
    expect(warned.msg).toContain("5");
    expect(warned.msg).toContain("ส่งผลใหม่");
  });

  it("holds on to a result the server rejected for an unknown reason", async () => {
    const a = load({ stored: [item()] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(serverErr());

    await a.api.flushQueue();

    expect(a.api.queue()).toHaveLength(1);
  });

  it("preserves order and stops at the first item it cannot send", async () => {
    const a = load({ stored: [item({ table: "1" }), item({ table: "2" }), item({ table: "3" })] });
    a.api._loadQueue();
    a.fetchMock
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await a.api.flushQueue();

    expect(a.api.queue().map((q: Item) => q.table)).toEqual(["2", "3"]);
  });

  it("never replays a result queued on another tournament's console", async () => {
    // Same browser, two events: a result held for tournament "other" must not
    // go out through THIS tournament's token — not even to be refused.
    const a = load({ stored: [item({ tid: "other", table: "7" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    expect(a.fetchMock).not.toHaveBeenCalled();
    expect(a.api.queue()).toHaveLength(0);
    const warned = a.toasts.find((t) => t.kind === "error")!;
    expect(warned.msg).toContain("7");
    expect(warned.msg).toContain("งานอื่น");
  });

  it("still sends a result queued before tournaments were separated (no tid)", async () => {
    const legacy = item();
    delete legacy.tid;
    const a = load({ stored: [legacy] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    expect(a.fetchMock).toHaveBeenCalledTimes(1);
    expect(a.api.queue()).toHaveLength(0);
  });

  it("drops a result this link may not write (401), and says so", async () => {
    // A rotated token, or a division that is not this tournament's: retrying
    // can never succeed, so the item must not sit in the queue forever.
    const a = load({ stored: [item({ table: "9" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue({
      status: 401,
      json: async () => ({ success: false, error: "Unauthorized" }),
    });

    await a.api.flushQueue();

    expect(a.api.queue()).toHaveLength(0);
    const warned = a.toasts.find((t) => t.kind === "error")!;
    expect(warned.msg).toContain("9");
  });

  it("drops a result whose table now holds a different pair, and says so", async () => {
    // The table number survived the re-export but the players changed, so the
    // server refuses it (MATCH_CHANGED). Replaying it would credit a win to two
    // people who never played that board.
    const a = load({ stored: [item({ table: "5", black: "ก", white: "ข" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(changed());

    await a.api.flushQueue();

    expect(a.api.queue()).toHaveLength(0);
    const warned = a.toasts.find((t) => t.kind === "error")!;
    expect(warned.msg).toContain("5");
    expect(warned.msg).toContain("ส่งผลใหม่");
  });

  it("keeps the whole queue when the writes are being rate limited", async () => {
    // 429 is about everyone writing at once, not about this result. Dropping it
    // would lose a judge's work over a speed bump.
    const a = load({ stored: [item({ table: "1" }), item({ table: "2" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(busy());

    await a.api.flushQueue();

    expect(a.fetchMock).toHaveBeenCalledTimes(1);
    expect(a.api.queue()).toHaveLength(2);
  });

  it("sends the pair the result was entered against, so it cannot land on another", async () => {
    const a = load({ stored: [item({ black: "ดำ", white: "ขาว" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    expect(JSON.parse(a.fetchMock.mock.calls[0][1].body)).toMatchObject({
      black: "ดำ", white: "ขาว",
    });
  });

  it("still sends a result queued before the names were recorded", async () => {
    // Items already in a judge's localStorage from before this shipped carry no
    // names; the server treats that as "unchecked" rather than rejecting them,
    // so they must go out unchanged instead of being stranded.
    const a = load({ stored: [item()] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    const body = JSON.parse(a.fetchMock.mock.calls[0][1].body);
    expect(body.black).toBeUndefined();
    expect(body.white).toBeUndefined();
    expect(a.api.queue()).toHaveLength(0);
  });

  it("buckets the rate limit per device, not per venue", async () => {
    // Same token and the same NAT'd wifi for every judge at the venue: without
    // a per-device key they shared one bucket and failed together.
    const a = load({ stored: [item()] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    const sent = a.fetchMock.mock.calls[0][1].headers["x-judge-client"];
    expect(sent).toBeTruthy();
    expect(a.store.get("tesuji_judge_client")).toBe(sent);
  });

  it("sends the judge's identity and remark with the result", async () => {
    const a = load({ stored: [item({ remark: "ขาดแข่ง" })] });
    a.api._loadQueue();
    a.fetchMock.mockResolvedValue(ok());

    await a.api.flushQueue();

    const [url, init] = a.fetchMock.mock.calls[0];
    expect(url).toBe("/api/divisions/d1/result");
    expect(init.method).toBe("PUT");
    expect(init.headers["x-admin-token"]).toBe("tok");
    expect(JSON.parse(init.body)).toMatchObject({
      round: "1", table: "5", winner: "BLACK",
      submittedBy: "สมชาย", remark: "ขาดแข่ง",
    });
  });
});

// The score calculator is pure arithmetic over three inputs and never touches
// the network, so this only pins the parsing decisions: what counts as blank,
// what counts as a valid half-point, and which side the komi lands on.
describe("score calculator", () => {
  const calc = load().api._calcScore as (
    black: unknown, white: unknown, komi: unknown,
  ) => Record<string, unknown>;

  it("adds komi to white before comparing", () => {
    expect(calc("48", "45", "6.5")).toMatchObject({
      state: "ok", winner: "W", margin: 3.5, whiteTotal: 51.5, komiMissing: false,
    });
    expect(calc("50", "40", "6.5")).toMatchObject({ state: "ok", winner: "B", margin: 3.5 });
    expect(calc(48, 45, 6.5)).toMatchObject({ state: "ok", winner: "W", margin: 3.5 });
  });

  it("calls a tie jigo only when the half points cancel", () => {
    expect(calc("40", "40", "0")).toMatchObject({ state: "ok", winner: "J", margin: 0 });
    expect(calc("45", "44.5", "0.5")).toMatchObject({ state: "ok", winner: "J" });
    expect(calc("45", "45", "0.5")).toMatchObject({ state: "ok", winner: "W", margin: 0.5 });
  });

  it("treats a blank score as not-yet-entered, never as zero", () => {
    expect(calc("", "45", "6.5")).toEqual({ state: "incomplete" });
    expect(calc("48", "   ", "6.5")).toEqual({ state: "incomplete" });
    expect(calc(undefined, 45, 6.5)).toEqual({ state: "incomplete" });
  });

  it("counts a blank komi as 0 and says so", () => {
    expect(calc("48", "45", "")).toMatchObject({
      state: "ok", winner: "B", margin: 3, komi: 0, komiMissing: true,
    });
  });

  it("accepts comma decimals and Thai digits", () => {
    expect(calc("48", "45", "6,5")).toMatchObject({ state: "ok", winner: "W", margin: 3.5 });
    expect(calc("๔๘", "๔๕", "๖.๕")).toMatchObject({ state: "ok", winner: "W", margin: 3.5 });
  });

  it("rejects anything that is not a whole or half point instead of rounding", () => {
    expect(calc("45.3", "45", "6.5")).toEqual({ state: "invalid" });
    expect(calc("48", "45", "6.25")).toEqual({ state: "invalid" });
    expect(calc("1e21", "45", "6.5")).toEqual({ state: "invalid" });
    expect(calc("0x10", "45", "6.5")).toEqual({ state: "invalid" });
    expect(calc("Infinity", "45", "6.5")).toEqual({ state: "invalid" });
  });

  it("rejects negative scores but allows reverse komi", () => {
    expect(calc("-1", "45", "6.5")).toEqual({ state: "invalid" });
    expect(calc("40", "45", "-7.5")).toMatchObject({ state: "ok", winner: "B", margin: 2.5 });
  });
});
