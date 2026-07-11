"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { CenterLoader } from "@/components/ui/feedback";

/**
 * Client-side guard for signed-in-only pages: shows a loader while the session
 * restores, and once auth settles with no user redirects to /login carrying a
 * `next` back to this page. Children only mount once a user is present, so
 * they can rely on useAuth().user being non-null.
 *
 * UX only — reads and writes are still enforced server-side (RLS / RPC auth).
 */
export function RequireAuth({
  next,
  children,
}: {
  /** Path to return to after login. Defaults to the current pathname. */
  next?: string;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const target = next ?? pathname ?? "/";

  useEffect(() => {
    if (!loading && !user)
      router.replace(`/login?next=${encodeURIComponent(target)}`);
  }, [loading, user, router, target]);

  if (loading || !user) return <CenterLoader />;
  return <>{children}</>;
}
