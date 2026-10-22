"use client";

import { createContext, useContext } from "react";
import type { AdminAccess, AdminRole } from "@/lib/admin-access";

/** What AdminAuthGate established about the signed-in account. Available to
 *  everything inside the admin shell; absent (throws) elsewhere. The shell uses
 *  it to hide what the account cannot open — the RPCs refuse for real. */
export interface AdminAccessValue {
  role: AdminRole;
  isAdmin: boolean;
  /** A SubAdmin's tournaments; empty for admins, who see every tournament. */
  tournamentIds: string[];
  /** The raw shape, for canAccessPath / navGroupsFor. */
  access: AdminAccess;
}

const Ctx = createContext<AdminAccessValue | null>(null);

export const AdminAccessProvider = Ctx.Provider;

export function useAdminAccess(): AdminAccessValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminAccess must be used inside AdminAuthGate");
  return v;
}
