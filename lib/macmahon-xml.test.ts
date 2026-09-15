import { describe, expect, it } from "vitest";
import {
  MM_BYE_NAME,
  divisionLabel,
  parseMacmahonXml,
  splitThaiFullName,
} from "@/lib/macmahon-xml";

// These standings are the input to admin_append_award_rows: /admin/awards turns
// place 1/2/3 into AWARD rows, and those rows drive the server-side 1-kyu
// ceiling that can block a player from registering at all. Points → SOS → SOSOS
// with a bye counted at the player's own score is arithmetic nobody re-derives
// by eye on award day, so it is pinned here.
//
// parseMacmahonXml runs in the browser and uses DOMParser, which Node has no
// global for. Rather than pull in a DOM (this suite is deliberately hermetic —
// see vitest.config.mts), the tests install a minimal XML parser that covers
// exactly the surface the module touches: documentElement, tagName, children,
// textContent and querySelector("parsererror"). It is a stand-in for the
// browser's parser, not a second implementation of it — the fixtures below are
// well-formed XML of the shape MacMahon 3.x writes, so the shim only has to
// agree with a real DOMParser on that subset.

type XmlNode = string | Elem;

class Elem {
  readonly tagName: string;
  readonly children: Elem[] = [];
  private readonly nodes: XmlNode[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(node: XmlNode): void {
    this.nodes.push(node);
    if (typeof node !== "string") this.children.push(node);
  }

  get textContent(): string {
    return this.nodes
      .map((n) => (typeof n === "string" ? n : n.textContent))
      .join("");
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (!body.startsWith("#")) return ENTITIES[body.toLowerCase()] ?? whole;
    const hex = body[1] === "x" || body[1] === "X";
    const cp = hex ? parseInt(body.slice(2), 16) : Number(body.slice(1));
    return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : whole;
  });
}

/** Throws on anything the browser would report as a <parsererror>. */
function parseXml(src: string): Elem {
  const body = src
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");
  const stack: Elem[] = [];
  let root: Elem | null = null;
  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf("<", i);
    if (lt < 0) {
      if (body.slice(i).trim()) throw new Error("text after the root element");
      break;
    }
    const before = body.slice(i, lt);
    if (before) {
      const parent = stack[stack.length - 1];
      if (parent) parent.append(decode(before));
      else if (before.trim()) throw new Error("text outside the root element");
    }
    const gt = body.indexOf(">", lt);
    if (gt < 0) throw new Error("unterminated tag");
    const tag = body.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (tag.startsWith("/")) {
      const closed = stack.pop();
      if (!closed || closed.tagName !== tag.slice(1).trim()) {
        throw new Error(`mismatched ${tag}`);
      }
      continue;
    }
    const selfClosing = tag.endsWith("/");
    const name = (selfClosing ? tag.slice(0, -1) : tag).trim().split(/\s/)[0];
    if (!/^[A-Za-z_][\w.:-]*$/.test(name)) throw new Error(`bad tag <${name}>`);
    const el = new Elem(name);
    const parent = stack[stack.length - 1];
    if (parent) parent.append(el);
    else if (root) throw new Error("second root element");
    else root = el;
    if (!selfClosing) stack.push(el);
  }
  const unclosed = stack[stack.length - 1];
  if (unclosed) throw new Error(`unclosed <${unclosed.tagName}>`);
  if (!root) throw new Error("no root element");
  return root;
}

class XmlDomParser {
  parseFromString(text: string): {
    documentElement: Elem;
    querySelector: (selector: string) => Elem | null;
  } {
    try {
      const root = parseXml(text);
      return { documentElement: root, querySelector: () => null };
    } catch {
      const err = new Elem("parsererror");
      return {
        documentElement: err,
        querySelector: (selector) => (selector === "parsererror" ? err : null),
      };
    }
  }
}

(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;

// ── fixtures ─────────────────────────────────────────────────────────────────
interface FixturePlayer {
  id: number;
  name: string;
}
interface FixtureGame {
  black?: number;
  white?: number;
  result?: string;
  bye?: boolean;
  forced?: boolean;
}

/** Build a MacMahon-shaped file. `rounds` defaults to the number of rounds
 *  actually supplied, so a fixture only trips the "saved mid-tournament"
 *  warning when it deliberately claims more. */
function tournamentXml(opts: {
  name?: string;
  rounds?: number;
  players: FixturePlayer[];
  roundGames?: FixtureGame[][];
}): string {
  const roundGames = opts.roundGames ?? [];
  const participants = opts.players
    .map(
      (p) =>
        `  <IndividualParticipant><Id>${p.id}</Id>` +
        `<GoPlayer><FirstName></FirstName><Surname>${p.name}</Surname>` +
        `<Rank>35K</Rank></GoPlayer></IndividualParticipant>`,
    )
    .join("\n");
  const rounds = roundGames
    .map((games, idx) => {
      const pairings = games
        .map(
          (g) =>
            `    <Pairing><Black>${g.black ?? 0}</Black>` +
            `<White>${g.white ?? 0}</White>` +
            `<Result>${g.result ?? ""}</Result>` +
            `<PairingWithBye>${g.bye ? "true" : "false"}</PairingWithBye>` +
            `<ForcedPairing>${g.forced ? "true" : "false"}</ForcedPairing>` +
            `</Pairing>`,
        )
        .join("\n");
      return `  <TournamentRound>\n    <RoundNumber>${idx + 1}</RoundNumber>\n${pairings}\n  </TournamentRound>`;
    })
    .join("\n");
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<Tournament>`,
    `  <Name>${opts.name ?? "03 - 9-12 Kyu"}</Name>`,
    `  <NumberOfRounds>${opts.rounds ?? roundGames.length}</NumberOfRounds>`,
    participants,
    rounds,
    `</Tournament>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const NAMES = ["สมชาย ใจดี", "สมหญิง รักเรียน", "วิชัย มั่นคง", "มานะ อดทน"];
const four: FixturePlayer[] = NAMES.map((name, i) => ({ id: i + 1, name }));

/** [place, name, points, sos, sosos] per row — the whole ranking in one line. */
function table(xmlText: string, fileName = "03 - 9-12 Kyu.xml") {
  return parseMacmahonXml(fileName, xmlText).standings.map((r) => [
    r.place,
    r.fullName,
    r.points,
    r.sos,
    r.sosos,
  ]);
}

describe("parseMacmahonXml standings", () => {
  it("ranks a complete round robin by points, then SOS, then SOSOS", () => {
    // 1 beats everyone (3); 4 beats 3 and 2 (2); 2 beats 3 (1); 3 loses all (0).
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        players: four,
        roundGames: [
          [
            { black: 1, white: 2, result: "1-0" },
            { black: 3, white: 4, result: "0-1" },
          ],
          [
            { black: 1, white: 4, result: "1-0" },
            { black: 2, white: 3, result: "1-0" },
          ],
          [
            { black: 1, white: 3, result: "1-0" },
            { black: 2, white: 4, result: "0-1" },
          ],
        ],
      }),
    );
    expect(
      parsed.standings.map((r) => [r.place, r.playerId, r.points, r.sos, r.sosos]),
    ).toEqual([
      [1, 1, 3, 3, 15],
      [2, 4, 2, 4, 14],
      [3, 2, 1, 5, 13],
      [4, 3, 0, 6, 12],
    ]);
    // A file that needs no operator attention must produce no noise, or the
    // real warnings stop being read.
    expect(parsed.warnings).toEqual([]);
    expect(parsed.standings.every((r) => !r.tiedWithNext)).toBe(true);
  });

  it("flags an exact points/SOS/SOSOS tie so the admin breaks it by hand", () => {
    // Two winners and two losers who played disjoint opponents: 2 and 3 land on
    // identical (1, 2, 4). Silently awarding one of them 2nd place is the
    // failure this flag exists to prevent.
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        players: four,
        roundGames: [
          [
            { black: 1, white: 2, result: "1-0" },
            { black: 3, white: 4, result: "1-0" },
          ],
          [
            { black: 1, white: 3, result: "1-0" },
            { black: 2, white: 4, result: "1-0" },
          ],
        ],
      }),
    );
    expect(
      parsed.standings.map((r) => [
        r.place,
        r.playerId,
        r.points,
        r.sos,
        r.sosos,
        r.tiedWithNext,
      ]),
    ).toEqual([
      [1, 1, 2, 2, 4, false],
      [2, 2, 1, 2, 4, true],
      [3, 3, 1, 2, 4, false],
      [4, 4, 0, 2, 4, false],
    ]);
  });

  it("counts a bye as a free win and as an opponent with the player's own score", () => {
    // EGF convention. Player 3 takes a bye then beats 1; player 2 only has a
    // bye. Player 3's SOS therefore includes its own 2 points.
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        players: four.slice(0, 3),
        roundGames: [
          [
            { black: 1, white: 2, result: "1-0" },
            { black: 3, bye: true, forced: true },
          ],
          [
            { black: 1, white: 3, result: "0-1" },
            { black: 2, bye: true, forced: true },
          ],
        ],
      }),
    );
    expect(
      parsed.standings.map((r) => [r.place, r.playerId, r.points, r.sos, r.sosos]),
    ).toEqual([
      [1, 3, 2, 3, 6],
      [2, 1, 1, 3, 5],
      [3, 2, 1, 2, 5],
    ]);
    expect(parsed.pairings.filter((g) => g.bye)).toHaveLength(2);
    // Byes are unheard-of in the organizer's files, so each one is surfaced.
    expect(parsed.warnings).toEqual([
      "รอบ 1: วิชัย มั่นคง ได้บาย (+1 คะแนน)",
      "รอบ 2: สมหญิง รักเรียน ได้บาย (+1 คะแนน)",
    ]);
  });

  it("keeps the odd-man placeholder in the table but marks it unawardable", () => {
    // The organizer's fake entrant can out-score a real player (everyone who
    // "beats" it gains a point), so it must never be silently awardable.
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        players: [
          { id: 1, name: NAMES[0] },
          { id: 2, name: MM_BYE_NAME },
        ],
        roundGames: [[{ black: 1, white: 2, result: "1-0" }]],
      }),
    );
    expect(parsed.standings.map((r) => [r.fullName, r.placeholder])).toEqual([
      [NAMES[0], false],
      [MM_BYE_NAME, true],
    ]);
    expect(parsed.warnings).toContain(
      `ไฟล์มีผู้เล่นตัวแทน “${MM_BYE_NAME}” — แสดงในตารางแต่จะไม่ถูกเลือกเป็นผู้ได้รางวัล`,
    );
  });

  it("awards no point for a 0-0 or missing result, and says so", () => {
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        players: four,
        roundGames: [
          [
            { black: 1, white: 2, result: "0-0" },
            { black: 3, white: 4, result: "" },
          ],
        ],
      }),
    );
    expect(parsed.standings.every((r) => r.points === 0)).toBe(true);
    expect(parsed.warnings).toEqual([
      "รอบ 1: สมชาย ใจดี – สมหญิง รักเรียน ผล 0-0 (ไม่มีผู้ชนะ)",
      "รอบ 1: วิชัย มั่นคง – มานะ อดทน ไม่มีผลการแข่งขัน",
    ]);
  });

  it("skips a pairing that names a player the file does not list", () => {
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        players: four.slice(0, 2),
        roundGames: [[{ black: 1, white: 99, result: "1-0" }]],
      }),
    );
    expect(parsed.standings.every((r) => r.points === 0)).toBe(true);
    expect(parsed.warnings).toContain(
      "รอบ 1: คู่แข่งอ้างถึงผู้เล่นที่ไม่มีในไฟล์ — ข้าม",
    );
  });

  it("warns about duplicate names, withdrawals and a mid-tournament save", () => {
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({
        rounds: 5,
        players: [
          { id: 1, name: NAMES[0] },
          { id: 2, name: NAMES[0] },
          { id: 3, name: NAMES[2] },
        ],
        roundGames: [[{ black: 1, white: 2, result: "1-0" }]],
      }),
    );
    expect(parsed.warnings).toEqual([
      `ชื่อ “${NAMES[0]}” ซ้ำกัน 2 คนในไฟล์ — ตรวจสอบก่อนบันทึก`,
      `${NAMES[2]} ไม่มีคู่แข่งขันเลย (อาจถอนตัวก่อนเริ่ม)`,
      "ไฟล์มีผลเพียง 1 จาก 5 รอบ — อาจเป็นไฟล์ที่บันทึกไว้กลางการแข่งขัน ตรวจสอบว่าเป็นไฟล์สุดท้ายจริง",
    ]);
  });

  it("skips a participant with no id or no name, and keeps the rest", () => {
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      `<?xml version="1.0"?>
<Tournament>
  <Name>03 - 9-12 Kyu</Name>
  <NumberOfRounds>0</NumberOfRounds>
  <IndividualParticipant><Id>1</Id><GoPlayer><Surname>${NAMES[0]}</Surname></GoPlayer></IndividualParticipant>
  <IndividualParticipant><Id>2</Id><GoPlayer><Surname>  </Surname></GoPlayer></IndividualParticipant>
  <IndividualParticipant><GoPlayer><Surname>${NAMES[1]}</Surname></GoPlayer></IndividualParticipant>
</Tournament>`,
    );
    expect(parsed.players).toEqual([{ id: 1, fullName: NAMES[0] }]);
    expect(parsed.warnings).toContain("ข้ามผู้เล่นที่ข้อมูลไม่ครบ (Id 2)");
    expect(parsed.warnings).toContain("ข้ามผู้เล่นที่ข้อมูลไม่ครบ (Id ?)");
  });

  it("collapses runs of whitespace inside a name", () => {
    // Our own export writes "<first> <last>"; a name retyped inside MacMahon
    // can arrive with a double space, and it must still match the seat.
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({ players: [{ id: 1, name: "สมชาย   ใจดี" }] }),
    );
    expect(parsed.players[0].fullName).toBe("สมชาย ใจดี");
  });

  it("reads the division name, round count and filename fallback", () => {
    const parsed = parseMacmahonXml(
      "03 - 9-12 Kyu.xml",
      tournamentXml({ name: "03 - 9-12 Kyu", rounds: 4, players: four }),
    );
    expect(parsed.divisionName).toBe("03 - 9-12 Kyu");
    expect(parsed.numberOfRounds).toBe(4);
    expect(parsed.fileName).toBe("03 - 9-12 Kyu.xml");

    const noName = parseMacmahonXml(
      "05 - 13x13.xml",
      `<Tournament><IndividualParticipant><Id>1</Id><GoPlayer><Surname>${NAMES[0]}</Surname></GoPlayer></IndividualParticipant></Tournament>`,
    );
    expect(noName.divisionName).toBe("05 - 13x13");
    expect(noName.numberOfRounds).toBe(0);
  });

  it("rejects a file that is not a MacMahon tournament", () => {
    expect(() => table("<Tournament><Name>x</Name>")).toThrow(/XML ไม่ถูกต้อง/);
    expect(() => table("<Rows><Row/></Rows>")).toThrow(/ไม่มี <Tournament>/);
    expect(() =>
      table("<Tournament><Name>03 - 9-12 Kyu</Name></Tournament>"),
    ).toThrow(/ไม่มีรายชื่อผู้เล่น/);
  });
});

describe("divisionLabel", () => {
  it("strips the ordering prefix MacMahon files carry", () => {
    expect(divisionLabel("03 - 9-12 Kyu")).toBe("9-12 Kyu");
    expect(divisionLabel("1 – 13x13")).toBe("13x13");
    expect(divisionLabel("  07 - ประถม  ")).toBe("ประถม");
  });

  it("leaves a bare category alone", () => {
    // The range's dash is indistinguishable from the prefix's, so stripping
    // first would turn "9-12 Kyu" into "12 Kyu" — a whole rank too strong.
    expect(divisionLabel("9-12 Kyu")).toBe("9-12 Kyu");
    expect(divisionLabel("3 Kyu")).toBe("3 Kyu");
    expect(divisionLabel("9x9")).toBe("9x9");
  });

  it("keeps a name that would strip to nothing", () => {
    expect(divisionLabel("12 - ")).toBe("12 -");
    expect(divisionLabel("ประถม")).toBe("ประถม");
  });
});

describe("splitThaiFullName", () => {
  it("splits on the first space, as our export composed it", () => {
    expect(splitThaiFullName("สมชาย ใจดี")).toEqual({
      firstName: "สมชาย",
      lastName: "ใจดี",
      ambiguous: false,
    });
  });

  it("marks a name it cannot split with confidence", () => {
    // Both cases must fall back to a seat match instead of writing a guess into
    // the award database.
    expect(splitThaiFullName("สมชาย")).toEqual({
      firstName: "สมชาย",
      lastName: "",
      ambiguous: true,
    });
    expect(splitThaiFullName("สมชาย ใจ ดี")).toEqual({
      firstName: "สมชาย",
      lastName: "ใจ ดี",
      ambiguous: true,
    });
  });

  it("normalises padding and repeated spaces before splitting", () => {
    expect(splitThaiFullName("  สมชาย   ใจดี  ")).toEqual({
      firstName: "สมชาย",
      lastName: "ใจดี",
      ambiguous: false,
    });
  });
});
