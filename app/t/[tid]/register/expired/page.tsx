"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTournament } from "@/components/tournament/TournamentProvider";
import { useRegisterFlow } from "@/components/register/RegisterFlowProvider";
import { useDataLayer } from "@/lib/data/store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n";

export default function ExpiredStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const { tournament } = useTournament();
  const { t } = useI18n();
  const { draft, reset } = useRegisterFlow();
  const batchId = draft.reservation?.batchId ?? null;

  // Hand the seats back now rather than waiting for the minute-by-minute cron
  // sweep. This page is also reached when the client's clock expired the hold
  // early, in which case the server still has those seats taken — and this is
  // the screen that tells the user they are gone, so they had better be. Once
  // per batch (the ref), best-effort (release_batch refuses anything that is
  // not pending_payment, which is exactly the case we don't care about).
  const releasedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!batchId || releasedRef.current === batchId) return;
    releasedRef.current = batchId;
    dl.releaseBatch(batchId).catch(() => {
      /* already swept / already cancelled — nothing to do */
    });
  }, [batchId, dl]);

  return (
    <div className="mx-auto max-w-app px-4 py-10">
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-inset ring-amber-400/30">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 7v5l3 2" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">
            {t.register.expiredHeading}
          </h1>
          <p className="mt-1 text-sm text-white/55">
            {t.register.expiredDesc}
          </p>
        </div>
        <Button
          fullWidth
          onClick={() => {
            reset();
            router.replace(`/t/${tournament.id}/register`);
          }}
        >
          {t.register.restart}
        </Button>
      </Card>
    </div>
  );
}
