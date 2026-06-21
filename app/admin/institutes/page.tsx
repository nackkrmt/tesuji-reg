"use client";

import { useState } from "react";
import { GoInstitute } from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/form";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

function instituteError(msg: string): string {
  if (msg.includes("DUPLICATE_NAME")) return "มีสถาบันชื่อนี้อยู่แล้ว";
  if (msg.includes("EMPTY_NAME")) return "กรุณากรอกชื่อสถาบัน";
  if (msg.includes("UNAUTHORIZED")) return "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)";
  return "ดำเนินการไม่สำเร็จ";
}

export default function AdminInstitutesPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const { data: institutes, loading } = useLiveQuery(
    (d) => d.adminListInstitutes(),
    [],
  );
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await dl.upsertInstitute({ nameTh: name });
      setNewName("");
      toast.show("เพิ่มสถาบันแล้ว", "success");
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  const list = institutes ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-white">สถาบันหมากล้อม</h1>
        <p className="mt-1 text-sm text-white/45">
          จัดการรายชื่อสถาบันที่ผู้สมัครเลือกได้ · ผู้สมัครพิมพ์เพิ่มเองได้และจะมาแสดงที่นี่ ·
          “ปิดใช้งาน” จะซ่อนออกจากตัวเลือก แต่ยังเก็บประวัติของผู้ที่เคยเลือกไว้
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <SectionTitle>เพิ่มสถาบันใหม่</SectionTitle>
        <div className="flex gap-2">
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อสถาบัน"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <Button onClick={add} loading={busy} className="shrink-0">
            เพิ่ม
          </Button>
        </div>
      </Card>

      {loading ? (
        <CenterLoader label="กำลังโหลด…" />
      ) : list.length === 0 ? (
        <EmptyState title="ยังไม่มีสถาบัน" description="เพิ่มสถาบันแรกด้านบน" />
      ) : (
        <div className="space-y-2">
          {list.map((i) => (
            <InstituteRow key={i.id} institute={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstituteRow({ institute }: { institute: GoInstitute }) {
  const dl = useDataLayer();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(institute.nameTh);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await dl.upsertInstitute({
        id: institute.id,
        nameTh: n,
        active: institute.active,
      });
      setEditing(false);
      toast.show("บันทึกแล้ว", "success");
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      if (institute.active) {
        await dl.deleteInstitute(institute.id);
        toast.show("ปิดใช้งานแล้ว", "success");
      } else {
        await dl.upsertInstitute({
          id: institute.id,
          nameTh: institute.nameTh,
          active: true,
        });
        toast.show("เปิดใช้งานแล้ว", "success");
      }
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn("flex items-center gap-2 p-3", !institute.active && "opacity-60")}>
      {editing ? (
        <>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button onClick={save} loading={busy} className="h-10 shrink-0 px-3 text-sm">
            บันทึก
          </Button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(institute.nameTh);
            }}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-white/55 transition hover:bg-white/10"
          >
            ยกเลิก
          </button>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white/90">{institute.nameTh}</p>
            {!institute.active && (
              <span className="text-xs text-white/40">ปิดใช้งาน</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-300 transition hover:bg-brand-500/10 disabled:opacity-50"
          >
            แก้ไข
          </button>
          <button
            type="button"
            onClick={toggleActive}
            disabled={busy}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-sm font-medium transition disabled:opacity-50",
              institute.active
                ? "text-rose-300 hover:bg-rose-500/10"
                : "text-emerald-300 hover:bg-emerald-500/10",
            )}
          >
            {institute.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
          </button>
        </>
      )}
    </Card>
  );
}
