import type { Locale } from "../config";
import { th, type Dictionary } from "./th";
import { en } from "./en";

export type { Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { th, en };
