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
// It is deliberately a static scan, not a database query: it must pass in CI
// with no credentials and no network.

const ROOT = join(__dirname, "..");
const CODE_DIRS = ["lib", "app", "components"];
const SQL_DIRS = ["supabase/migrations", "supabase/bootstrap"];

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
  return out;
}

/** RPC names the client calls, e.g. `sb.rpc("reserve_seats", …)`. */
function calledRpcNames(): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of CODE_DIRS) {
    for (const file of walk(join(ROOT, dir), (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) {
        if (!found.has(m[1])) found.set(m[1], file.slice(ROOT.length + 1));
      }
    }
  }
  return found;
}

/** Function names any repo SQL file creates. */
function definedFunctionNames(): Set<string> {
  const names = new Set<string>();
  const files = SQL_DIRS.flatMap((d) => walk(join(ROOT, d), (f) => f.endsWith(".sql")));
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi,
    )) {
      names.add(m[1].toLowerCase());
    }
  }
  return names;
}

describe("RPC coverage", () => {
  const called = calledRpcNames();
  const defined = definedFunctionNames();

  it("finds the call sites and the definitions at all (guards the scan itself)", () => {
    // If a refactor changes how RPCs are invoked, this test must fail loudly
    // rather than pass vacuously on an empty set.
    expect(called.size).toBeGreaterThan(50);
    expect(defined.size).toBeGreaterThan(50);
    expect(called.has("reserve_seats")).toBe(true);
  });

  it("defines every RPC the app calls somewhere in supabase/", () => {
    const missing = [...called.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, file]) => `${name}  (called from ${file})`);
    expect(missing).toEqual([]);
  });
});
