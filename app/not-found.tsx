"use client";

import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <>
      <PublicHeader />
      <div className="mx-auto max-w-app px-4 pb-dock pt-10">
        <EmptyState
          title={t.errorPage.notFoundTitle}
          description={t.errorPage.notFoundDesc}
          action={
            <Link href="/">
              <Button>{t.errorPage.goHome}</Button>
            </Link>
          }
        />
      </div>
    </>
  );
}
