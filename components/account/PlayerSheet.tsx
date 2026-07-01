"use client";

import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  emptyPerson,
  personalSchema,
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
  const { t } = useI18n();
  const { data: ownerProfile } = useLiveQuery((d) => d.getMyProfile(), []);
  const methods = useForm<PersonFormValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: editing ? personToFormValues(editing) : emptyPerson(),
    mode: "onTouched",
  });

  const seedKey = editing?.id ?? "new";
  useEffect(() => {
    methods.reset(editing ? personToFormValues(editing) : emptyPerson());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, open]);

  async function onSubmit(v: PersonFormValues) {
    const saved = await dl.upsertMyPlayer({
      id: editing?.id,
      ...personFormToPerson(v),
    });
    toast.show(editing ? t.players.editSaved : t.players.added, "success");
    onSaved?.(saved);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? t.players.editTitle : t.players.addTitle}
      footer={
        <Button
          type="submit"
          form="player-form"
          fullWidth
          loading={methods.formState.isSubmitting}
        >
          {editing ? t.common.save : t.players.addTitle}
        </Button>
      }
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
        </form>
      </FormProvider>
    </Sheet>
  );
}
