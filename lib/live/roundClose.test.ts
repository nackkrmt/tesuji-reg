import { describe, expect, it } from "vitest";
import {
  buildClosure,
  closuresFromConfigRows,
  divisionOfRoundClosedKey,
  parseRoundClosure,
  publicClosures,
  roundClosedKey,
  tablesChangedSinceClose,
} from "./roundClose";

// Round 1 of "BMA 6 Years Old M" at The Best of Gen (2026-09-26), shape only:
// three tables played after judges Force-moved the players who came, five
// tables of no-shows that never got a result.
const ROUND1 = [
  { table: "1", result: "0-1" },
  { table: "2", result: "?-?" },
  { table: "3", result: "?-?" },
  { table: "4", result: "1-0" },
  { table: "5", result: "?-?" },
  { table: "6", result: "1-0" },
  { table: "7", result: "?-?" },
  { table: "8", result: "?-?" },
];

describe("round_closed keys", () => {
  it("round-trips a division id, including the <tid8>-<code> form", () => {
    const id = "d70bed1e-08";
    expect(divisionOfRoundClosedKey(roundClosedKey(id))).toBe(id);
  });

  it("ignores other live_config keys and a bare prefix", () => {
    expect(divisionOfRoundClosedKey("announcement")).toBeNull();
    expect(divisionOfRoundClosedKey("round_closed:")).toBeNull();
  });
});

describe("buildClosure", () => {
  it("lists the tables without a result and keeps every result", () => {
    const c = buildClosure("1", ROUND1, "สมชาย", "2026-09-26T03:50:00.000Z");
    expect(c.round).toBe("1");
    expect(c.by).toBe("สมชาย");
    expect(c.pending).toEqual(["2", "3", "5", "7", "8"]);
    expect(c.results["4"]).toBe("1-0");
    expect(Object.keys(c.results)).toHaveLength(8);
  });

  it("orders tables numerically, not as text", () => {
    const c = buildClosure("2", [{ table: "10", result: "?-?" }, { table: "9", result: "?-?" }], "", "");
    expect(c.pending).toEqual(["9", "10"]);
  });

  it("treats an empty result as pending", () => {
    expect(buildClosure("1", [{ table: "1", result: "" }], "", "").pending).toEqual(["1"]);
  });
});

describe("parseRoundClosure", () => {
  it("reads back what buildClosure stores", () => {
    const stored = JSON.parse(JSON.stringify(buildClosure("3", ROUND1, "ก", "t")));
    expect(parseRoundClosure(stored)).toEqual(buildClosure("3", ROUND1, "ก", "t"));
  });

  it("reads a reopened round (empty round) as open", () => {
    expect(parseRoundClosure({ round: "", reopenedRound: "3", at: "t", by: "ก" })).toBeNull();
  });

  it("rejects values that are not a closure", () => {
    expect(parseRoundClosure(null)).toBeNull();
    expect(parseRoundClosure("1")).toBeNull();
    expect(parseRoundClosure(["1"])).toBeNull();
    expect(parseRoundClosure({ text: "ประกาศ" })).toBeNull();
  });

  it("still reports a closed round when the optional parts are missing or junk", () => {
    expect(parseRoundClosure({ round: "2", pending: [1, "4"], results: { "1": 5, "2": "1-0" } })).toEqual({
      round: "2",
      at: "",
      by: "",
      pending: ["4"],
      results: { "2": "1-0" },
    });
  });
});

describe("closuresFromConfigRows / publicClosures", () => {
  const rows = [
    { key: "announcement", value: { text: "พักเที่ยง", urgent: false } },
    { key: roundClosedKey("div-a"), value: buildClosure("1", ROUND1, "สมชาย", "t1") },
    { key: roundClosedKey("div-b"), value: { round: "", reopenedRound: "2", at: "t2", by: "" } },
    { key: roundClosedKey("div-c"), value: buildClosure("4", [], "", "t3") },
  ];

  it("keeps only closed rounds, by division", () => {
    const c = closuresFromConfigRows(rows);
    expect(Object.keys(c).sort()).toEqual(["div-a", "div-c"]);
    expect(c["div-a"].by).toBe("สมชาย");
  });

  it("publishes round and time only, for this board's divisions only", () => {
    const pub = publicClosures(closuresFromConfigRows(rows), ["div-a", "div-b"]);
    expect(pub).toEqual({ "div-a": { round: "1", at: "t1" } });
    expect(JSON.stringify(pub)).not.toContain("สมชาย");
  });
});

describe("tablesChangedSinceClose", () => {
  const closure = buildClosure("1", ROUND1, "", "");

  it("is empty when nothing changed", () => {
    expect(tablesChangedSinceClose(closure, ROUND1)).toEqual([]);
  });

  it("reports a result entered, cancelled or flipped after the close", () => {
    const now = ROUND1.map((r) =>
      r.table === "2" ? { ...r, result: "1-0" }
      : r.table === "4" ? { ...r, result: "?-?" }
      : r.table === "6" ? { ...r, result: "0-1" }
      : r,
    );
    expect(tablesChangedSinceClose(closure, now)).toEqual(["2", "4", "6"]);
  });

  it("reports a table that appeared after the close, not one that went away", () => {
    const now = [...ROUND1.filter((r) => r.table !== "8"), { table: "9", result: "?-?" }];
    expect(tablesChangedSinceClose(closure, now)).toEqual(["9"]);
  });
});
