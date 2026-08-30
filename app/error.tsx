"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  // Nothing collects client errors yet, so the console is the only trail a
  // maintainer has when a user reports a blank screen.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PublicHeader />
      <div className="mx-auto max-w-app px-4 pb-dock pt-10">
        <EmptyState
          title={t.errorPage.crashTitle}
          description={t.errorPage.crashDesc}
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={reset}>{t.common.retry}</Button>
              <Link href="/">
                <Button variant="secondary">{t.errorPage.goHome}</Button>
              </Link>
            </div>
          }
        />
      </div>
    </>
  );
}
