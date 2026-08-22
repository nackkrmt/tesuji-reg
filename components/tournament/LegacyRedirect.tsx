"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "@/lib/data/store";
import { groupForHome } from "@/lib/tournament-list";
import { CenterLoader } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";

/** Permanent stub behind the pre-multi-tournament URLs (/schedule, /rules,
 *  /participants, /register) so old shared links keep working: hop to the
 *  same page of the most relevant tournament — the open one closing soonest,
 *  else the newest published — or home when there is none. Client-side
 *  because the mock backend lives in localStorage. */
export function LegacyRedirect({ sub }: { sub?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { data: tournaments, error } = useLiveQuery(
    (d) => d.listTournaments(),
    [],
  );

  useEffect(() => {
    if (error) {
      router.replace("/");
      return;
    }
    if (!tournaments) return;
    const groups = groupForHome(tournaments);
    const target =
      groups.open[0] ?? tournaments.find((x) => x.status === "published");
    if (!target) {
      router.replace("/");
      return;
    }
    router.replace(sub ? `/t/${target.id}/${sub}` : `/t/${target.id}`);
  }, [tournaments, error, router, sub]);

  return <CenterLoader label={t.common.loading} />;
}
