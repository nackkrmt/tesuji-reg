"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  emptyPerson,
  personalSchema,
  personFormToPerson,
  PersonFormValues,
  personToFormValues,
} from "@/lib/validation/schemas";
import { Profile } from "@/lib/data/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { PersonFields } from "@/components/register/PersonFields";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { safeInternalPath } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function ProfileInner() {
  const next = useSearchParams().get("next") || "";
  // Bounce back to /profile (carrying the onward `next`) after login.
  const self = "/profile" + (next ? `?next=${encodeURIComponent(next)}` : "");
  return (
    <RequireAuth next={self}>
      <ProfileLoader next={next} />
    </RequireAuth>
  );
}

function ProfileLoader({ next }: { next: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: profile, loading } = useLiveQuery(
    (d) => d.getMyProfile(),
    [user?.id],
  );

  if (loading) return <CenterLoader label={t.common.loading} />;

  return <ProfileForm key={profile?.id ?? "new"} initial={profile ?? null} next={next} />;
}

function ProfileForm({
  initial,
  next,
}: {
  initial: Profile | null;
  next: string;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const { t } = useI18n();
  const router = useRouter();

  const methods = useForm<PersonFormValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: initial ? personToFormValues(initial) : emptyPerson(),
    mode: "onTouched",
  });

  async function onSubmit(v: PersonFormValues) {
    await dl.upsertMyProfile(personFormToPerson(v));
    toast.show(t.profile.saved, "success");
    router.replace(safeInternalPath(next, "/account"));
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="mx-auto max-w-app px-4 pb-dock pt-4"
      >
        <Card className="space-y-4 p-4">
          <div>
            <h2 className="text-base font-bold text-white">
              {initial ? t.profile.editTitle : t.profile.firstTitle}
            </h2>
            <p className="text-sm text-white/45">
              {t.profile.subtitle}
            </p>
          </div>
          <PersonFields />
        </Card>
        <Button
          type="submit"
          fullWidth
          className="mt-4"
          loading={methods.formState.isSubmitting}
        >
          {t.common.save}
        </Button>
      </form>
    </FormProvider>
  );
}

function ProfileHeader() {
  const { t } = useI18n();
  return <PublicHeader back="/" title={t.profile.headerTitle} />;
}

export default function ProfilePage() {
  return (
    <>
      <ProfileHeader />
      <Suspense fallback={<CenterLoader />}>
        <ProfileInner />
      </Suspense>
    </>
  );
}
