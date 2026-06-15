"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SelectedParticipant,
  useRegisterFlow,
} from "@/components/register/RegisterFlowProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { ManagedPlayer, MAX_GROUP_SIZE } from "@/lib/data/types";
import { PlayerSheet } from "@/components/account/PlayerSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn, fullNameTh } from "@/lib/utils";
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";

export default function SelectParticipantsStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();
  const { draft, setParticipants, setReservation } = useRegisterFlow();

  const { data: profile } = useLiveQuery((d) => d.getMyProfile(), []);
  const { data: players, loading } = useLiveQuery((d) => d.listMyPlayers(), []);

  // selection keys: "self" or a player id
  const [selected, setSelected] = useState<Set<string>>(() => {
    const init = new Set<string>(
      draft.participants.map((p) => (p.source === "self" ? "self" : p.playerId!)),
    );
    if (init.size === 0) init.add("self");
    return init;
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  if (loading || !profile) return <CenterLoader label="กำลังโหลด…" />;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        if (next.size >= MAX_GROUP_SIZE) {
          toast.show(`เลือกได้สูงสุด ${MAX_GROUP_SIZE} คน`, "error");
          return prev;
        }
        next.add(key);
      }
      return next;
    });
  }

  async function onNext() {
    if (selected.size === 0) {
      toast.show("กรุณาเลือกผู้เข้าแข่งขันอย่างน้อย 1 คน", "error");
      return;
    }
    // preserve previously-assigned categories when re-selecting the same person
    const prevCat = new Map(
      draft.participants.map((p) => [
        p.source === "self" ? "self" : p.playerId!,
        p.categoryId,
      ]),
    );
    const participants: SelectedParticipant[] = Array.from(selected).map((key) =>
      key === "self"
        ? { source: "self", categoryId: prevCat.get("self") ?? "" }
        : { source: "player", playerId: key, categoryId: prevCat.get(key) ?? "" },
    );
    setParticipants(participants);
    if (draft.reservation) {
      await dl.releaseBatch(draft.reservation.batchId);
      setReservation(null);
    }
    router.push("/register/categories");
  }

  return (
    <div className="mx-auto max-w-app px-4 py-4">
      <h2 className="mb-1 text-base font-bold text-slate-900">
        เลือกผู้เข้าแข่งขัน
      </h2>
      <p className="mb-3 text-sm text-slate-400">
        เลือกตัวคุณเอง และ/หรือ ผู้เล่นในความดูแล (สูงสุด {MAX_GROUP_SIZE} คน)
      </p>

      <div className="space-y-2.5">
        <SelectableCard
          checked={selected.has("self")}
          onToggle={() => toggle("self")}
          title={fullNameTh(profile)}
          subtitle="ตัวฉัน"
          tag="ฉัน"
        />
        {(players ?? []).map((p) => (
          <SelectableCard
            key={p.id}
            checked={selected.has(p.id)}
            onToggle={() => toggle(p.id)}
            title={fullNameTh(p)}
            subtitle={p.phone}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
      >
        + เพิ่มผู้เล่นในความดูแล
      </button>

      <ActionBarSpacer />
      <StickyActionBar>
        <Button fullWidth onClick={onNext}>
          ถัดไป ({selected.size} คน)
        </Button>
      </StickyActionBar>

      <PlayerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={null}
        onSaved={(player: ManagedPlayer) =>
          setSelected((prev) => new Set(prev).add(player.id))
        }
      />
    </div>
  );
}

function SelectableCard({
  checked,
  onToggle,
  title,
  subtitle,
  tag,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  tag?: string;
}) {
  return (
    <Card
      className={cn(
        "flex cursor-pointer items-center gap-3 p-4 transition",
        checked ? "border-brand-400 ring-2 ring-brand-200" : "hover:border-slate-300",
      )}
    >
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-5 w-5 accent-brand-700"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">
            {title}
            {tag && (
              <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                {tag}
              </span>
            )}
          </p>
          <p className="truncate text-sm text-slate-400">{subtitle}</p>
        </div>
      </label>
    </Card>
  );
}
