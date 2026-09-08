import { describe, expect, it } from "vitest";
import {
  rosterRegistrationIndex,
  rosterRegistrationSource,
} from "@/lib/data/roster";
import type { RosterRegistration } from "@/lib/data/types";

function row(over: Partial<RosterRegistration> = {}): RosterRegistration {
  return {
    rosterKind: "managed_player",
    rosterId: "player-1",
    tournamentId: "t-1",
    categoryId: "cat-1",
    categoryCode: "ก1",
    categoryName: "รุ่นทดสอบ",
    feeThb: 300,
    batchStatus: "confirmed",
    byMe: true,
    seatId: "seat-1",
    batchId: "batch-1",
    batchReference: "TSJ-0001",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("rosterRegistrationIndex", () => {
  it("returns an empty map for no rows", () => {
    expect(rosterRegistrationIndex([]).size).toBe(0);
  });

  it("groups seats by the roster row they matched", () => {
    const index = rosterRegistrationIndex([
      row({ rosterId: "a", seatId: "s1" }),
      row({ rosterId: "b", seatId: "s2" }),
      row({ rosterId: "a", seatId: "s3" }),
    ]);
    expect([...index.keys()].sort()).toEqual(["a", "b"]);
    expect(index.get("a")?.map((r) => r.seatId)).toEqual(["s1", "s3"]);
    expect(index.get("b")).toHaveLength(1);
  });

  it("keeps self and managed-player rows apart", () => {
    const index = rosterRegistrationIndex([
      row({ rosterKind: "self", rosterId: "profile-1" }),
      row({ rosterKind: "managed_player", rosterId: "player-1" }),
    ]);
    expect(index.get("profile-1")?.[0].rosterKind).toBe("self");
    expect(index.get("player-1")?.[0].rosterKind).toBe("managed_player");
  });
});

describe("rosterRegistrationSource", () => {
  it("is null when the person holds no seat", () => {
    expect(rosterRegistrationSource(undefined)).toBeNull();
    expect(rosterRegistrationSource([])).toBeNull();
  });

  it("is 'own' when the caller entered every seat", () => {
    expect(rosterRegistrationSource([row({ byMe: true })])).toBe("own");
  });

  it("is 'other' when another account entered the person", () => {
    expect(
      rosterRegistrationSource([row({ byMe: false, batchId: null })]),
    ).toBe("other");
  });

  it("is 'mixed' when both accounts entered the person", () => {
    expect(
      rosterRegistrationSource([
        row({ byMe: true, seatId: "s1" }),
        row({ byMe: false, seatId: "s2", batchId: null }),
      ]),
    ).toBe("mixed");
  });
});
