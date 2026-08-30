import { MockDataLayer } from "./MockDataLayer";
import { SupabaseDataLayer } from "./SupabaseDataLayer";
import type { DataLayer } from "./types";

// Backend is chosen by env flag so the same UI runs on either implementation:
//   NEXT_PUBLIC_DATA_BACKEND=supabase  → real Supabase (Milestone 2)
//   anything else / unset              → localStorage mock (Milestone 1)
const backend = process.env.NEXT_PUBLIC_DATA_BACKEND ?? "mock";

export const dataLayer: DataLayer =
  backend === "supabase" ? new SupabaseDataLayer() : new MockDataLayer();

/** True when the app runs on the localStorage mock. UI gates conveniences that
 *  write throwaway data on it — seeding a demo tournament into a real database
 *  publishes a fake event to the public home page. */
export const isMockBackend = backend !== "supabase";

export * from "./types";
