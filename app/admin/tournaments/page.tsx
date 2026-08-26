"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDataLayer } from "@/lib/data/store";
import type { Tournament, TournamentStatus } from "@/lib/data/types";
import { regWindow } from "@/lib/tournament-window";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Pill } from "@/components/ui/feedback";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatThaiDate, formatThaiDateTime } from "@/lib/utils";

const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "ร่าง",
  published: "เผยแพร่แล้ว",
  closed: "ปิดแล้ว",
};

export default function AdminTournamentsPage() {
  const { tournaments, loading, tid, setTid } = useAdminTournament();
  const router = useRouter();

  if (loading)
    return (
      <div aria-busy="true">
        <SkeletonRows count={3} />
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="ทัวร์นาเมนต์"
        description="รายการแข่งขันทั้งหมด — สร้างใหม่ แก้ไข เผยแพร่ หรือปิดแยกรายงานได้"
        action={
          <Button onClick={() => router.push("/admin/tournaments/new")}>
            + สร้างรายการใหม่
          </Button>
        }
      />

      {tournaments.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการแข่งขัน"
          description="กดปุ่มด้านบนเพื่อสร้างรายการแรก"
        />
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <TournamentRow
              key={t.id}
              tournament={t}
              selected={t.id === tid}
              onOpen={() => {
                setTid(t.id);
                router.push(`/admin/tournaments/${t.id}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ t }: { t: Tournament }) {
  if (t.status === "draft") return <Pill tone="neutral">{STATUS_LABEL.draft}</Pill>;
  if (t.status === "closed") return <Pill tone="bad">{STATUS_LABEL.closed}</Pill>;
  const win = regWindow(t);
  if (win === "open") return <Pill tone="good">เปิดรับสมัคร</Pill>;
  if (win === "before") return <Pill tone="warn">ยังไม่ถึงเวลารับสมัคร</Pill>;
  return <Pill tone="neutral">ปิดรับสมัครแล้ว</Pill>;
}

function TournamentRow({
  tournament: t,
  selected,
  onOpen,
}: {
  tournament: Tournament;
  selected: boolean;
  onOpen: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: TournamentStatus) {
    setBusy(true);
    try {
      await dl.setTournamentStatus(t.id, next);
      toast.show(
        next === "published" ? "เผยแพร่รายการแล้ว" : "อัปเดตสถานะแล้ว",
        "success",
      );
    } catch {
      toast.show("อัปเดตสถานะไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={selected ? "p-4 ring-1 ring-inset ring-brand-400/40" : "p-4"}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusPill t={t} />
            {selected && <Pill tone="neutral">กำลังจัดการ</Pill>}
          </div>
          <p className="mt-1.5 truncate font-semibold text-ink">{t.nameTh}</p>
          <p className="mt-0.5 text-sm text-ink-tertiary">
            แข่งวันที่ {formatThaiDate(t.competitionDate, "th")} · รับสมัครถึง{" "}
            {formatThaiDateTime(t.registrationClosesAt, "th")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {t.status !== "published" ? (
            <Button
              size="sm"
              variant="success"
              loading={busy}
              onClick={() => setStatus("published")}
            >
              เผยแพร่
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => setStatus("closed")}
            >
              ปิดรายการ
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onOpen}>
            แก้ไข
          </Button>
        </div>
      </div>
      <Link href={`/t/${t.id}`} className="mt-2 inline-block text-xs font-medium text-brand-300 hover:text-brand-200">
        ดูหน้าเว็บของรายการนี้ →
      </Link>
    </Card>
  );
}
