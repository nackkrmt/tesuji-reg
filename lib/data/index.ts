import { SupabaseDataLayer } from "./SupabaseDataLayer";
import type { DataLayer } from "./types";

export const dataLayer: DataLayer = new SupabaseDataLayer();

export * from "./types";
