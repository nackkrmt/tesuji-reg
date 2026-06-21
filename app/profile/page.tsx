"use client";

import { Suspense, useEffect } from "react";
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
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { PersonFields } from "@/components/register/PersonFields";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

function ProfileInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "";

  useEffect(() => {
    if (!authLoading && !user) {
      const self = "/profile" + (next ? `?next=${encodeURIComponent(next)}` : "");
      router.replace(`/login?next=${encodeURIComponent(self)}`);
    }
  }, [authLoading, user, router, next]);

  const { data: profile, loading } = useLiveQuery(
    (d) => d.getMyProfile(),
    [user?.id],
  );

  if (authLoading || !user || loading) return <CenterLoader label="กำลังโหลด…" />;

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
  const router = useRouter();

  const methods = useForm<PersonFormValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: initial ? personToFormValues(initial) : emptyPerson(),
    mode: "onTouched",
  });

  async function onSubmit(v: PersonFormValues) {
    await dl.upsertMyProfile(personFormToPerson(v));
    toast.show("บันทึกข้อมูลส่วนตัวแล้ว", "success");
    router.replace(next || "/account");
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
              {initial ? "ข้อมูลส่วนตัวของฉัน" : "กรอกข้อมูลส่วนตัว (ครั้งแรก)"}
            </h2>
            <p className="text-sm text-white/45">
              บันทึกครั้งเดียว ครั้งต่อไปจะถูกเติมให้อัตโนมัติเมื่อสมัคร
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
          บันทึก
        </Button>
      </form>
    </FormProvider>
  );
}

export default function ProfilePage() {
  return (
    <>
      <PublicHeader back="/" title="ข้อมูลส่วนตัว" />
      <Suspense fallback={<CenterLoader />}>
        <ProfileInner />
      </Suspense>
    </>
  );
}
