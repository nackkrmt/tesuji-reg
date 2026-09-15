import { MockDataLayer } from "./MockDataLayer";
import { SupabaseDataLayer } from "./SupabaseDataLayer";
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
const raw = process.env.NEXT_PUBLIC_DATA_BACKEND?.trim().toLowerCase();
const hasSupabaseEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

function resolveBackend(): "supabase" | "mock" {
  if (raw === "supabase" || raw === "mock") return raw;
  if (hasSupabaseEnv) {
    throw new Error(
      `NEXT_PUBLIC_DATA_BACKEND must be "supabase" or "mock" (got ${
        raw ? `"${raw}"` : "an empty value"
      }). A Supabase URL is configured, so falling back to the localStorage mock ` +
        "would quietly replace the real backend — and its fake auth treats every " +
        "signed-in user as an admin.",
    );
  }
  // No Supabase project configured at all: a plain `next build`/`next dev` with
  // no env file. The mock is the only thing that can work, so use it.
  return "mock";
}

const backend = resolveBackend();

export const dataLayer: DataLayer =
  backend === "supabase" ? new SupabaseDataLayer() : new MockDataLayer();

/** True when the app runs on the localStorage mock. UI gates conveniences that
 *  write throwaway data on it — seeding a demo tournament into a real database
 *  publishes a fake event to the public home page. */
export const isMockBackend = backend !== "supabase";

export * from "./types";
