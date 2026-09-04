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
  divId: string; round: string; table: string;
  winner: string; submittedBy: string; remark?: string;
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

  const factory = new Function(
    "window", "document", "localStorage", "navigator", "fetch",
    "registerActions", "esc",
    `${SRC}
     return {
       enqueueResult, flushQueue, _loadQueue, renderQueueBar,
       queue: () => _queue,
     };`,
  );

  const api = factory(
    { addEventListener: () => {}, __JUDGE_SECRET: "tok" },
    document,
    localStorage,
    { onLine: opts.online ?? true },
    fetchMock,
    () => {},
    (s: string) => s,
  );
  return { api, fetchMock, toasts, bar, store, loadDivData };
}

const item = (over: Partial<Item> = {}): Item => ({
  divId: "d1", round: "1", table: "5",
  winner: "BLACK", submittedBy: "สมชาย", ...over,
});

const ok = () => ({ json: async () => ({ success: true }) });
const gone = () => ({ json: async () => ({ code: "MATCH_NOT_FOUND", error: "gone" }) });
const serverErr = () => ({ json: async () => ({ error: "BOOM" }) });

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
