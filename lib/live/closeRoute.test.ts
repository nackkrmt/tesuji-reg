// PUT /api/divisions/:id/close against a stand-in for Supabase: the token
// gate, the current-round guard, and the value that reaches live_set_config.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TID = "d70bed1e-e694-4c44-b650-58073c4a30fb";
const DIV = "d70bed1e-08";
const TOKEN = "live-token";

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let matchData: {
  currentRound: string | null;
  allMatches: { round: string; table: string; result: string }[];
};

vi.mock("@/lib/live/serverData", () => ({
  getServerSupabase: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "live_token_tournament") {
        return args.p_secret === TOKEN ? { data: TID, error: null } : { data: null, error: null };
      }
      if (fn === "live_set_config") return { data: null, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  }),
  resolveDivisionId: async (tid: string, id: string) =>
    tid === TID && (id === DIV || id === "08") ? DIV : null,
  getDivisionMatchData: async () => matchData,
}));

const { PUT } = await import("@/app/api/divisions/[id]/close/route");

function put(body: unknown, opts: { token?: string; id?: string } = {}) {
  const req = new Request(`http://test/api/divisions/${opts.id ?? "08"}/close`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-admin-token": opts.token ?? TOKEN,
      // a fresh rate-limit bucket per request, so tests never trip the limiter
      "x-judge-client": `t-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ id: opts.id ?? "08" }) });
}

function setConfigCalls() {
  return rpcCalls.filter((c) => c.fn === "live_set_config");
}

beforeEach(() => {
  rpcCalls.length = 0;
  matchData = {
    currentRound: "1",
    allMatches: [
      { round: "1", table: "1", result: "0-1" },
      { round: "1", table: "2", result: "?-?" },
      { round: "1", table: "3", result: "1-0" },
    ],
  };
});

describe("PUT /api/divisions/:id/close", () => {
  it("closes the current round with a server-built snapshot of its results", async () => {
    const res = await put({ round: "1", closed: true, by: "สมชาย" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.closure.pending).toEqual(["2"]);

    const [call] = setConfigCalls();
    expect(call.args.p_secret).toBe(TOKEN);
    expect(call.args.p_tournament_id).toBe(TID);
    expect(call.args.p_key).toBe(`round_closed:${DIV}`);
    const value = call.args.p_value as Record<string, unknown>;
    expect(value).toMatchObject({
      round: "1",
      by: "สมชาย",
      pending: ["2"],
      results: { "1": "0-1", "2": "?-?", "3": "1-0" },
    });
    expect(typeof value.at).toBe("string");
  });

  it("reopens by writing an empty round", async () => {
    const res = await put({ round: "1", closed: false, by: "สมชาย" });
    expect(res.status).toBe(200);
    expect((await res.json()).closure).toBeNull();
    const value = setConfigCalls()[0].args.p_value as Record<string, unknown>;
    expect(value.round).toBe("");
    expect(value.reopenedRound).toBe("1");
  });

  it("refuses a round that is no longer the division's current one", async () => {
    matchData.currentRound = "2";
    const res = await put({ round: "1", closed: true, by: "สมชาย" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ROUND_NOT_CURRENT");
    expect(setConfigCalls()).toHaveLength(0);
  });

  it("refuses a bad token before touching anything", async () => {
    const res = await put({ round: "1", closed: true }, { token: "wrong" });
    expect(res.status).toBe(401);
    expect(setConfigCalls()).toHaveLength(0);
  });

  it("refuses a division outside the token's tournament", async () => {
    const res = await put({ round: "1", closed: true }, { id: "99" });
    expect(res.status).toBe(404);
    expect(setConfigCalls()).toHaveLength(0);
  });

  it("requires round and a boolean closed", async () => {
    expect((await put({ closed: true })).status).toBe(400);
    expect((await put({ round: "1", closed: "yes" })).status).toBe(400);
    expect(setConfigCalls()).toHaveLength(0);
  });

  it("bounds the judge name instead of storing whatever was sent", async () => {
    await put({ round: "1", closed: true, by: "ก".repeat(500) });
    const value = setConfigCalls()[0].args.p_value as Record<string, unknown>;
    expect((value.by as string).length).toBe(120);
  });
});
