"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { Category } from "@/lib/data/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/form";
import {
  CenterLoader,
  EmptyState,
  StatusBadge,
} from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import {
  formatThaiDate,
  formatThaiDateTime,
  formatThb,
  fullNameEn,
  fullNameTh,
} from "@/lib/utils";

export default function RegistrationDetail({ batchId }: { batchId: string }) {
  const dl = useDataLayer();
  const toast = useToast();
  const router = useRouter();

  const { data: bws, loading } = useLiveQuery(
    (d) => d.getBatch(batchId),
    [batchId],
  );
  const tid = bws?.batch.tournamentId;
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const catMap = useMemo(() => {
    const m: Record<string, Category> = {};
    (categories ?? []).forEach((c) => (m[c.id] = c));
    return m;
  }, [categories]);

  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  if (!bws)
    return <EmptyState title="ไม่พบใบสมัคร" description="อาจถูกลบหรือหมดอายุ" />;

  const { batch, seats } = bws;
  const canReview = batch.status === "pending_review";

  async function onConfirm() {
    setWorking(true);
    try {
      await dl.confirmRegistration(batchId, "admin");
      toast.show("ยืนยันการสมัครแล้ว", "success");
    } catch {
      toast.show("ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setWorking(false);
    }
  }

  async function onReject() {
    setWorking(true);
    try {
      await dl.rejectRegistration(batchId, "admin", reason.trim());
      toast.show("ปฏิเสธการสมัครและคืนที่นั่งแล้ว", "success");
      setRejectOpen(false);
    } catch {
      toast.show("ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <button
        onClick={() => router.push("/admin/registrations")}
        className="text-sm font-medium text-slate-500"
      >
        ← กลับรายการ
      </button>

      {/* header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-slate-500">
            {batch.referenceCode}
          </span>
          <StatusBadge status={batch.status} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <Info label="ประเภท" value={batch.kind === "group" ? "กลุ่ม" : "เดี่ยว"} />
          <Info label="จำนวน" value={`${seats.length} คน`} />
          <Info label="เบอร์ติดต่อ" value={batch.submitterPhone} />
          <Info label="ยอดรวม" value={`${formatThb(batch.totalAmountThb)} บาท`} />
          <Info
            label="ส่งเมื่อ"
            value={formatThaiDateTime(batch.createdAt)}
          />
          {batch.reviewedAt && (
            <Info
              label="ตรวจเมื่อ"
              value={formatThaiDateTime(batch.reviewedAt)}
            />
          )}
        </div>
        {batch.adminNote && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            เหตุผลที่ปฏิเสธ: {batch.adminNote}
          </p>
        )}
      </Card>

      {/* people */}
      <div className="space-y-3">
        {seats.map((s, i) => {
          const cat = catMap[s.categoryId];
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">
                    {i + 1}. {fullNameTh(s)}
                  </p>
                  <p className="text-sm text-slate-400">{fullNameEn(s)}</p>
                </div>
                {cat && (
                  <span className="shrink-0 rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                    {cat.code}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm text-slate-500">
                <span>รุ่น: {cat ? cat.name : "—"}</span>
                <span>ค่าสมัคร: {formatThb(s.feeThbSnapshot)} ฿</span>
                <span>โทร: {s.phone}</span>
                <span>เกิด: {formatThaiDate(s.dob)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* slip */}
      {batch.paymentSlipUrl && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            สลิปการโอนเงิน
          </h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={batch.paymentSlipUrl}
            alt="payment slip"
            className="max-h-96 w-full rounded-xl object-contain ring-1 ring-slate-200"
          />
        </Card>
      )}

      {/* actions */}
      {canReview && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="danger"
            onClick={() => setRejectOpen(true)}
            disabled={working}
          >
            ปฏิเสธ
          </Button>
          <Button variant="success" onClick={onConfirm} loading={working}>
            ยืนยันการสมัคร
          </Button>
        </div>
      )}

      <Sheet
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="ปฏิเสธการสมัคร"
        footer={
          <Button
            variant="danger"
            fullWidth
            onClick={onReject}
            loading={working}
          >
            ยืนยันการปฏิเสธ
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-500">
          ที่นั่งที่จองไว้จะถูกคืนกลับเข้าระบบ ระบุเหตุผล (ถ้ามี)
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น สลิปไม่ถูกต้อง / ยอดเงินไม่ตรง"
          rows={4}
        />
      </Sheet>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}: </span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
