"use client";

import { LegacyRedirect } from "@/components/tournament/LegacyRedirect";

/** Catch-all stub for the pre-multi-tournament wizard URLs (/register,
 *  /register/applicant, …) — hops into the same step under /t/[tid]/register
 *  of the most relevant tournament. Someone mid-flow across the deploy keeps
 *  their step and (via the draft-key migration) their draft. */
export default function LegacyRegisterRedirect({
  params,
}: {
  params: { rest?: string[] };
}) {
  const sub = ["register", ...(params.rest ?? [])].join("/");
  return <LegacyRedirect sub={sub} />;
}
