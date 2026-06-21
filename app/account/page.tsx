"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ManagedPlayer } from "@/lib/data/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { PlayerSheet } from "@/components/account/PlayerSheet";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { fullNameTh } from "@/lib/utils";

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/account");
  }, [authLoading, user, router]);

  const { data: players, loading } = useLiveQuery(
    (d) => d.listMyPlayers(),
    [user?.id],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedPlayer | null>(null);

  if (authLoading || !user) return <CenterLoader />;

  async function onDelete(p: ManagedPlayer) {
    if (!window.confirm(`ลบ "${fullNameTh(p)}" ออกจากรายชื่อ?`)) return;
    await dl.deleteMyPlayer(p.id);
    toast.show("ลบผู้เล่นแล้ว", "success");
  }

  return (
    <>
      <PublicHeader back="/" title="ผู้เล่นในความดูแล" />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        <p className="mb-3 text-sm text-white/55">
          บันทึกผู้เล่นที่คุณดูแล (เช่น ลูกทีม/บุตรหลาน) เพื่อใช้สมัครซ้ำได้สะดวก
        </p>

        {loading ? (
          <CenterLoader />
        ) : (players?.length ?? 0) === 0 ? (
          <EmptyState
            title="ยังไม่มีผู้เล่นในความดูแล"
            description="กดปุ่มด้านล่างเพื่อเพิ่มผู้เล่นคนแรก"
          />
        ) : (
          <div className="space-y-3">
            {players!.map((p) => (
              <Card key={p.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white/90">
                    {fullNameTh(p)}
                  </p>
                  <p className="text-sm text-white/45">{p.phone}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-300 transition hover:bg-brand-500/10"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => onDelete(p)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
                  >
                    ลบ
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Button
          className="mt-4"
          fullWidth
          variant="secondary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + เพิ่มผู้เล่น
        </Button>
      </main>

      <PlayerSheet open={open} onClose={() => setOpen(false)} editing={editing} />
    </>
  );
}
