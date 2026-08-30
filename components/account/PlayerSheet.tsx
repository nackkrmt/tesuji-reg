"use client";

import { useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  emptyPerson,
  makePersonalSchema,
  personFormToPerson,
  PersonFormValues,
  personToFormValues,
} from "@/lib/validation/schemas";
import { ManagedPlayer } from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { PersonFields } from "@/components/register/PersonFields";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";

export function PlayerSheet({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: ManagedPlayer | null;
  onSaved?: (player: ManagedPlayer) => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const { t, locale } = useI18n();
  const { data: ownerProfile } = useLiveQuery((d) => d.getMyProfile(), []);
  // Locale-aware validation messages — see the same pattern in app/profile.
  const resolver = useMemo(
    () => zodResolver(makePersonalSchema(t.validation)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );
  const methods = useForm<PersonFormValues>({
    resolver,
    defaultValues: editing ? personToFormValues(editing) : emptyPerson(),
    mode: "onTouched",
  });

  const seedKey = editing?.id ?? "new";
  useEffect(() => {
    methods.reset(editing ? personToFormValues(editing) : emptyPerson());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, open]);

  async function onSubmit(v: PersonFormValues) {
    let saved;
    try {
      saved = await dl.upsertMyPlayer({
        id: editing?.id,
        ...personFormToPerson(v),
      });
    } catch {
      // Keep the sheet open so the filled-in form survives the retry.
      toast.show(t.common.saveFailed, "error");
      return;
    }
    toast.show(editing ? t.players.editSaved : t.players.added, "success");
    onSaved?.(saved);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? t.players.editTitle : t.players.addTitle}
    >
      <FormProvider {...methods}>
        <form id="player-form" onSubmit={methods.handleSubmit(onSubmit)}>
          <PersonFields
            ownerDefaults={
              ownerProfile
                ? {
                    phone: ownerProfile.phone,
                    province: ownerProfile.province,
                    instituteId: ownerProfile.instituteId,
                    instituteName: ownerProfile.instituteName,
                  }
                : null
            }
          />
          {/* Inline at the end of the (long) form, like the profile page —
              not a sticky footer, which on a form this tall would sit right
              where the bottom nav dock is. */}
          <Button
            type="submit"
            fullWidth
            className="mb-2 mt-4"
            loading={methods.formState.isSubmitting}
          >
            {editing ? t.common.save : t.players.addTitle}
          </Button>
        </form>
      </FormProvider>
    </Sheet>
  );
}
