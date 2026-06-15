import { MockDataLayer } from "./MockDataLayer";
import { SupabaseDataLayer } from "./SupabaseDataLayer";
import type { DataLayer } from "./types";

// Backend is chosen by env flag so the same UI runs on either implementation:
//   NEXT_PUBLIC_DATA_BACKEND=supabase  → real Supabase (Milestone 2)
//   anything else / unset              → localStorage mock (Milestone 1)
const backend = process.env.NEXT_PUBLIC_DATA_BACKEND ?? "mock";

export const dataLayer: DataLayer =
  backend === "supabase" ? new SupabaseDataLayer() : new MockDataLayer();

export * from "./types";
