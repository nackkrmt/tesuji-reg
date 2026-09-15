import type { DataLayer } from "./types";

// Backend is chosen by env flag so the same UI runs on either implementation:
//   NEXT_PUBLIC_DATA_BACKEND=supabase  → real Supabase
//   NEXT_PUBLIC_DATA_BACKEND=mock      → localStorage mock (offline demo/dev)
//
// There is deliberately no silent default. The mock has a fake auth in which
// every signed-in user is an admin (MockDataLayer.isAdmin), so a production
// build that lost the flag would serve an "admin" console to anyone instead of
// failing — the failure mode this guard exists to prevent. NEXT_PUBLIC_* values
// are inlined at build time, so this is a build-configuration check, not a
// runtime one.
//
// Every read of the flag below compares `process.env.NEXT_PUBLIC_DATA_BACKEND`
// literally, and on purpose. The value is substituted as a string literal
// before the bundler parses this file, so `"supabase" === "supabase"` is a
// constant it can fold — which is what lets the branch nobody asked for, and
// the 2,600-line implementation it requires, be dropped from the bundle
// instead of shipped to every visitor. Routing the same test through a
// variable or a helper (resolveBackend()) defeats that fold; that is how the
// mock came to sit in the production first load. The cost is that the flag is
// now matched exactly: a stray space or capital no longer resolves, it trips
// the guard (or picks the mock when there is no Supabase project at all),
// which is the safe direction for a typo in a build config.
if (
  process.env.NEXT_PUBLIC_DATA_BACKEND !== "supabase" &&
  process.env.NEXT_PUBLIC_DATA_BACKEND !== "mock" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
) {
  const raw = process.env.NEXT_PUBLIC_DATA_BACKEND;
  throw new Error(
    `NEXT_PUBLIC_DATA_BACKEND must be "supabase" or "mock" (got ${
      raw ? `"${raw}"` : "an empty value"
    }). A Supabase URL is configured, so falling back to the localStorage mock ` +
      "would quietly replace the real backend — and its fake auth treats every " +
      "signed-in user as an admin.",
  );
}

// require(), not import: a top-level `import` of both implementations keeps
// both modules in the graph whichever branch wins, which is the other half of
// why the mock shipped.
export const dataLayer: DataLayer =
  process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase"
    ? new (require("./SupabaseDataLayer") as typeof import("./SupabaseDataLayer")).SupabaseDataLayer()
    : new (require("./MockDataLayer") as typeof import("./MockDataLayer")).MockDataLayer();

/** True when the app runs on the localStorage mock. UI gates conveniences that
 *  write throwaway data on it — seeding a demo tournament into a real database
 *  publishes a fake event to the public home page. */
export const isMockBackend = process.env.NEXT_PUBLIC_DATA_BACKEND !== "supabase";

export * from "./types";
