import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The backend's real logic lives in ~90 SECURITY DEFINER functions, and for a
// long stretch many of them existed only inside the production database —
// authored in the SQL editor, never captured in the repo. A lost project could
// not have been rebuilt, and nothing would have said so until the day it
// mattered. This test closes that gap from the application side: every RPC the
// app actually calls must be defined by SQL that ships in this repo.
//
// A name alone is not enough, though. PostgREST resolves an RPC by the exact
// set of argument NAMES in the JSON body, so the failures that actually happen
// here are signature failures: a migration renames or adds a parameter, or an
// app change passes a key the newest definition dropped, and the call comes
// back PGRST202 ("function not found") or PGRST203 ("could not choose the best
// candidate") in production while CI stays green — see the hand-picked probes
// in app/api/health/route.ts, which only run when a human opens the URL. So the
// scan also replays every create/drop in the repo's SQL and checks each call
// site's argument keys against the signature that survives.
//
// It is deliberately a static scan, not a database query: it must pass in CI
// with no credentials and no network.

const ROOT = join(__dirname, "..");
const CODE_DIRS = ["lib", "app", "components"];
// Order matters: supabase/bootstrap is the snapshot of what the dashboard held
// when the repo took over, and supabase/migrations is the changelog applied on
// top of it in filename order. Replaying them in that order is what makes the
// last surviving definition of a function the one production has.
const SQL_DIRS = ["supabase/bootstrap", "supabase/migrations"];

/** Call sites the repo SQL no longer backs. Empty, and meant to stay that way —
 *  an entry here is a call that will answer PGRST202 once the migrations are
 *  applied, so it is a defect being tolerated, not an exemption being granted.
 *
 *  It held one: checkToken() in lib/live/client.ts called live_check_token,
 *  which 20260915_0001 drops on the grounds that nothing calls it. checkToken()
 *  was that caller and was itself unreferenced, so the wrapper was deleted
 *  rather than the function restored. */
const KNOWN_STALE_CALLS: Record<string, string> = {};

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    // A missing directory must not crash collection — losing supabase/bootstrap
    // is precisely the failure this test exists to report.
    if (!existsSync(cur)) continue;
    for (const entry of readdirSync(cur)) {
      const full = join(cur, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "node_modules" && entry !== ".next") stack.push(full);
      } else if (match(entry)) {
        out.push(full);
      }
    }
  }
  // Sorted, because the SQL replay below depends on filename order.
  return out.sort();
}

/** The text from `src[start]` to its matching closing delimiter, skipping
 *  quoted strings and comments so a brace inside either cannot end it. */
function balanced(src: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i) + 1;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/** Keys written directly in an object literal, e.g. `{ p_id: x, ...rest }` →
 *  ["p_id"]. Nested objects, strings and comments are skipped. */
function topLevelKeys(objectLiteral: string): string[] {
  const body = objectLiteral.slice(1, -1);
  const keys: string[] = [];
  let depth = 0;
  let atKey = true;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "'" || c === '"' || c === "`") {
      i++;
      while (i < body.length && body[i] !== c) i += body[i] === "\\" ? 2 : 1;
      i++;
      atKey = false;
      continue;
    }
    if (c === "/" && body[i + 1] === "/") {
      const nl = body.indexOf("\n", i);
      i = nl < 0 ? body.length : nl;
      continue;
    }
    if (c === "/" && body[i + 1] === "*") {
      i = body.indexOf("*/", i) + 2;
      continue;
    }
    if ("{[(".includes(c)) {
      depth++;
      atKey = false;
      i++;
      continue;
    }
    if ("}])".includes(c)) {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c === ",") {
      atKey = true;
      i++;
      continue;
    }
    if (depth === 0 && atKey) {
      const key = body.slice(i).match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (key) {
        keys.push(key[1].toLowerCase());
        i += key[0].length;
        atKey = false;
        continue;
      }
    }
    i++;
  }
  return keys;
}

interface RpcCall {
  name: string;
  /** Keys the call always sends. */
  certain: string[];
  /** Keys it may send — `certain` plus anything behind a conditional spread. */
  possible: string[];
  /** The arguments are not a plain object literal, so this scan cannot read
   *  them — reported rather than skipped, since a silent skip would hollow the
   *  signature check out one call site at a time. */
  unreadable: boolean;
  where: string;
}

/** Every `sb.rpc("name", { … })` in the app, with the argument keys it sends. */
function calledRpcs(): RpcCall[] {
  const calls: RpcCall[] = [];
  for (const dir of CODE_DIRS) {
    for (const file of walk(join(ROOT, dir), (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))) {
      const src = readFileSync(file, "utf8");
      const rel = file.slice(ROOT.length + 1);
      for (const m of src.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) {
        const where = `${rel}:${src.slice(0, m.index).split("\n").length}`;
        let i = m.index + m[0].length;
        while (/\s/.test(src[i] ?? "")) i++;
        let certain: string[] = [];
        let possible: string[] = [];
        let unreadable = false;
        if (src[i] === ",") {
          i++;
          while (/\s/.test(src[i] ?? "")) i++;
          const literal = src[i] === "{" ? balanced(src, i, "{", "}") : null;
          if (!literal) {
            unreadable = true;
          } else {
            certain = topLevelKeys(literal);
            // A conditional spread (`...(x ? { p_note: x } : {})`) hides a key
            // the call sometimes sends; it still has to exist in the signature.
            possible = [
              ...new Set([
                ...certain,
                ...[...literal.matchAll(/\bp_[a-z0-9_]*(?=\s*:)/gi)].map((k) =>
                  k[0].toLowerCase(),
                ),
              ]),
            ];
          }
        }
        calls.push({ name: m[1], certain, possible, unreadable, where });
      }
    }
  }
  return calls;
}

interface SqlParam {
  name: string;
  optional: boolean;
}
interface SqlSignature {
  params: SqlParam[];
  file: string;
}

/** Split a SQL argument list on its top-level commas. */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "'") {
      cur += c;
      i++;
      while (i < inner.length && inner[i] !== "'") cur += inner[i++];
      cur += "'";
      continue;
    }
    if ("([".includes(c)) depth++;
    if (")]".includes(c)) depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** One create or drop, with where it sits in the replay order. */
interface SqlEvent {
  kind: "create" | "drop";
  name: string;
  arity: number;
  params: SqlParam[];
  file: string;
  /** Index of the file, then offset within it. */
  order: [number, number];
}

/** True when `pos` sits inside a `--` line comment. These migrations explain
 *  themselves in prose, and a sentence quoting a create or a drop must not be
 *  replayed as one. */
function inLineComment(src: string, pos: number): boolean {
  return src.lastIndexOf("--", pos) >= src.lastIndexOf("\n", pos) + 1;
}

/** Everything the repo's SQL does to a function, in the order Postgres saw it:
 *  bootstrap first, then each migration, and within a file by position — a
 *  migration that drops an overload and immediately creates its replacement
 *  has to replay in exactly that order. */
function sqlEvents(): SqlEvent[] {
  const events: SqlEvent[] = [];
  const files = SQL_DIRS.flatMap((d) => walk(join(ROOT, d), (f) => f.endsWith(".sql")));
  for (const [order, file] of files.entries()) {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(ROOT.length + 1);
    const argsAt = (at: number, name: string): string[] => {
      const args = balanced(src, at, "(", ")");
      if (args == null) throw new Error(`${rel}: unbalanced argument list for ${name}`);
      const inner = args.slice(1, -1).trim();
      return inner ? splitArgs(inner) : [];
    };
    for (const m of src.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
    )) {
      if (inLineComment(src, m.index)) continue;
      const name = m[1].toLowerCase();
      const params: SqlParam[] = argsAt(m.index + m[0].length - 1, name).map((raw) => {
        const arg = raw.trim();
        const body = arg.replace(/^(in|out|inout|variadic)\s+/i, "");
        return {
          name: (body.match(/^([A-Za-z_][\w$]*)/) ?? [, "?"])[1]!.toLowerCase(),
          // An OUT parameter never appears in the JSON body, and a parameter
          // with a default may be left out of it.
          optional:
            /^(out|inout)\s/i.test(arg) ||
            /\bdefault\b/i.test(body) ||
            body.includes(":="),
        };
      });
      events.push({
        kind: "create",
        name,
        arity: params.length,
        params,
        file: rel,
        order: [order, m.index],
      });
    }
    // A drop names argument TYPES, not parameter names, so the count is the
    // only part of it that identifies the overload — which is enough, since
    // Postgres cannot hold two same-arity overloads that differ only in types
    // here (every one of these functions takes text/uuid/jsonb scalars).
    for (const m of src.matchAll(
      /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi,
    )) {
      if (inLineComment(src, m.index)) continue;
      const name = m[1].toLowerCase();
      events.push({
        kind: "drop",
        name,
        arity: argsAt(m.index + m[0].length - 1, name).length,
        params: [],
        file: rel,
        order: [order, m.index],
      });
    }
  }
  return events.sort(
    (a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1],
  );
}

/** The signatures still standing once every event has been replayed. Keyed by
 *  name, then by argument count — how Postgres keeps overloads apart. A name
 *  whose every overload was dropped stays in the map with an empty inner map,
 *  so "called but dropped" reads differently from "never written". */
function liveSignatures(): Map<string, Map<number, SqlSignature>> {
  const live = new Map<string, Map<number, SqlSignature>>();
  for (const e of sqlEvents()) {
    let byArity = live.get(e.name);
    if (!byArity) {
      byArity = new Map<number, SqlSignature>();
      live.set(e.name, byArity);
    }
    if (e.kind === "create") byArity.set(e.arity, { params: e.params, file: e.file });
    else byArity.delete(e.arity);
  }
  return live;
}

/** Would PostgREST find a function for this call? Every key the body can
 *  carry has to be declared, and every parameter without a default has to be
 *  in the body — those are the two ways a call earns a PGRST202. */
function resolves(call: RpcCall, overloads: SqlSignature[]): boolean {
  return overloads.some((sig) => {
    const declared = new Set(sig.params.map((p) => p.name));
    return (
      call.possible.every((key) => declared.has(key)) &&
      sig.params.every((p) => p.optional || call.certain.includes(p.name))
    );
  });
}

describe("RPC coverage", () => {
  const calls = calledRpcs();
  const live = liveSignatures();

  it("finds the call sites and the definitions at all (guards the scan itself)", () => {
    // If a refactor changes how RPCs are invoked, this test must fail loudly
    // rather than pass vacuously on an empty set.
    expect(new Set(calls.map((c) => c.name)).size).toBeGreaterThan(50);
    expect(live.size).toBeGreaterThan(50);
    expect(calls.some((c) => c.name === "reserve_seats")).toBe(true);
    // …and the argument scan has to be reading arguments, not just names.
    expect(calls.filter((c) => c.certain.length > 0).length).toBeGreaterThan(50);
    const reserve = calls.find((c) => c.name === "reserve_seats")!;
    expect(reserve.certain).toContain("p_seats");
    // A call whose arguments are built elsewhere (`sb.rpc(name, args)`) is
    // invisible to the signature check, so it has to be reported here instead.
    expect(
      calls.filter((c) => c.unreadable).map((c) => `${c.name} (${c.where})`),
    ).toEqual([]);
  });

  it("rejects a wrong key and a missing one (negative control)", () => {
    // The signature check below is only worth its runtime if it fails when a
    // signature stops matching, so it is exercised here against a real call
    // whose four parameters all lack defaults.
    const reserve = calls.find((c) => c.name === "reserve_seats")!;
    const overloads = [...live.get("reserve_seats")!.values()];
    expect(resolves(reserve, overloads)).toBe(true);
    // A key the definition does not declare (a rename in either direction).
    expect(
      resolves({ ...reserve, possible: [...reserve.possible, "p_phone"] }, overloads),
    ).toBe(false);
    // A required parameter the call does not send (a new argument).
    expect(
      resolves(
        { ...reserve, certain: reserve.certain.filter((k) => k !== "p_seats") },
        overloads,
      ),
    ).toBe(false);
    // And the guard must not be satisfied by an empty overload list.
    expect(resolves(reserve, [])).toBe(false);
  });

  it("defines every RPC the app calls somewhere in supabase/", () => {
    const missing = calls
      .filter((c) => (live.get(c.name)?.size ?? 0) === 0)
      .filter((c) => !(c.name in KNOWN_STALE_CALLS))
      .map((c) => `${c.name}  (called from ${c.where})`);
    expect(missing).toEqual([]);
  });

  it("keeps no call site alive past its function being dropped", () => {
    // Two-way: a new stale call fails the test above, and an allowlist entry
    // whose call site has since been deleted fails here, so the exemption
    // cannot quietly outlive the defect it documents.
    const stale = calls
      .filter((c) => (live.get(c.name)?.size ?? 0) === 0)
      .map((c) => c.name);
    expect([...new Set(stale)].sort()).toEqual(Object.keys(KNOWN_STALE_CALLS).sort());
  });

  it("passes the argument keys the surviving definition declares", () => {
    // PGRST202 in production, silently, for every one of these.
    const wrong: string[] = [];
    for (const call of calls) {
      const overloads = [...(live.get(call.name)?.values() ?? [])];
      // Both covered by the tests above.
      if (overloads.length === 0 || call.unreadable) continue;
      if (!resolves(call, overloads)) {
        wrong.push(
          `${call.name} (${call.where}) sends {${call.possible.join(", ")}} but ` +
            overloads
              .map((s) => `${s.file} declares (${s.params.map((p) => p.name).join(", ")})`)
              .join(" / "),
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("leaves no called function with two candidate overloads", () => {
    // PGRST203: Postgres keeps every overload until one is dropped, and
    // PostgREST refuses to guess between two that both fit the body. This is
    // the failure app/api/health/route.ts was written to catch by hand after
    // live_upsert_division shipped a second signature.
    const ambiguous = calls
      .filter((c) => (live.get(c.name)?.size ?? 0) > 1)
      .map(
        (c) =>
          `${c.name}: ${[...live.get(c.name)!.values()]
            .map((s) => `(${s.params.map((p) => p.name).join(", ")}) in ${s.file}`)
            .join(" / ")}`,
      );
    expect([...new Set(ambiguous)]).toEqual([]);
  });
});
