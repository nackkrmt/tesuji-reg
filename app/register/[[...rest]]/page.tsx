"use client";

import { use } from "react";
import { LegacyRedirect } from "@/components/tournament/LegacyRedirect";

/** Catch-all stub for the pre-multi-tournament wizard URLs (/register,
 *  /register/applicant, …) — hops into the same step under /t/[tid]/register
 *  of the most relevant tournament. Someone mid-flow across the deploy keeps
 *  their step and (via the draft-key migration) their draft.
 *
 *  Next 15 hands `params` to client components as a promise, so it is unwrapped
 *  with `use()` rather than read directly. */
export default function LegacyRegisterRedirect({
  params,
}: {
  params: Promise<{ rest?: string[] }>;
}) {
  const { rest } = use(params);
  const sub = ["register", ...(rest ?? [])].join("/");
  return <LegacyRedirect sub={sub} />;
}
