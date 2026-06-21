"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import {
  Category,
  RegistrationSeat,
  SlipVerifyData,
  SlipVerifyStatus,
  TITLE_PREFIXES,
  remainingSeats,
} from "@/lib/data/types";
import {
  seatEditFormToInput,
  seatEditSchema,
  SeatEditFormValues,
} from "@/lib/validation/schemas";
import { RANK_OPTIONS } from "@/lib/rank";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { Field, Select, Textarea, TextInput, Toggle } from "@/components/ui/form";
import {
  CenterLoader,
  EmptyState,
  StatusBadge,
} from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import {
  cn,
  formatThaiDate,
  formatThaiDateTime,
  formatThb,
  fullNameEn,
  fullNameTh,
} from "@/lib/utils";

/** Map a thrown RPC/mock error code to a Thai message for admins. */
function seatErrorMessage(msg: string): string {
  if (msg.includes("CATEGORY_FULL")) return "รุ่นที่เลือกเต็มแล้ว";
  if (msg.includes("RANK_REQUIRED")) return "รุ่นนี้ต้องระบุระดับฝีมือก่อน";
  if (msg.includes("RANK_NOT_ELIGIBLE")) return "ระดับฝีมือไม่ตรงกับรุ่นที่เลือก";
  if (msg.includes("AGE_NOT_ELIGIBLE")) return "อายุไม่ตรงกับรุ่นที่เลือก";
  if (msg.includes("CATEGORY_NOT_FOUND")) return "ไม่พบรุ่นที่เลือก";
  if (msg.includes("SEAT_NOT_FOUND") || msg.includes("BATCH_NOT_FOUND"))
    return "ไม่พบข้อมูล (อาจถูกลบไปแล้ว)";
  return "ดำเนินการไม่สำเร็จ";
}

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
  const [verifying, setVerifying] = useState(false);
  const [editingSeat, setEditingSeat] = useState<RegistrationSeat | null>(null);

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

  async function onDeleteSeat(seat: RegistrationSeat) {
    if (seats.length === 1) {
      if (
        !window.confirm(
          `"${fullNameTh(seat)}" เป็นคนสุดท้ายในใบสมัครนี้ — ลบแล้วใบสมัครจะถูกยกเลิกทั้งใบ ดำเนินการต่อ?`,
        )
      )
        return;
    } else if (!window.confirm(`ลบ "${fullNameTh(seat)}" ออกจากใบสมัครนี้?`)) {
      return;
    }
    setWorking(true);
    try {
      const res = await dl.deleteSeat(batchId, seat.id, "admin");
      toast.show("ลบรายชื่อแล้ว", "success");
      if (res.seats.length === 0) router.push("/admin/registrations");
    } catch (e) {
      toast.show(seatErrorMessage((e as Error).message), "error");
    } finally {
      setWorking(false);
    }
  }

  async function onVerifySlip() {
    setVerifying(true);
    try {
      const res = await dl.verifySlip(batchId);
      const msg =
        res.status === "verified"
          ? "สลิปถูกต้อง ยอดตรง"
          : res.status === "amount_mismatch"
            ? "ยอดในสลิปไม่ตรงกับยอดที่ต้องจ่าย"
            : res.status === "duplicate"
              ? "สลิปนี้เคยถูกใช้แล้ว"
              : res.status === "demo"
                ? "โหมดทดสอบ — ยังไม่ได้ตั้ง SlipOK API key"
                : "ตรวจสลิปไม่ผ่าน";
      toast.show(
        msg,
        res.status === "verified"
          ? "success"
          : res.status === "demo"
            ? "info"
            : "error",
      );
    } catch (e) {
      toast.show(
        (e as Error).message === "NO_SLIP"
          ? "ยังไม่มีสลิป"
          : "ตรวจสลิปไม่สำเร็จ",
        "error",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function onDeleteBatch() {
    if (
      !window.confirm(
        `ลบใบสมัคร "${batch.referenceCode}" ทั้งหมด ${seats.length} คน?\nที่นั่งที่จองไว้จะถูกคืนกลับเข้าระบบ`,
      )
    )
      return;
    setWorking(true);
    try {
      await dl.deleteBatch(batchId, "admin");
      toast.show("ลบใบสมัครแล้ว", "success");
      router.push("/admin/registrations");
    } catch (e) {
      toast.show(seatErrorMessage((e as Error).message), "error");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <button
        onClick={() => router.push("/admin/registrations")}
        className="text-sm font-medium text-white/50 transition hover:text-white/80"
      >
        ← กลับรายการ
      </button>

      {/* header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-white/60">
            {batch.referenceCode}
          </span>
          <StatusBadge status={batch.status} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <Info label="ประเภท" value={batch.kind === "group" ? "กลุ่ม" : "เดี่ยว"} />
          <Info label="จำนวน" value={`${seats.length} คน`} />
          <Info label="เบอร์ติดต่อ" value={batch.submitterPhone} />
          <Info label="ยอดรวม" value={`${formatThb(batch.totalAmountThb)} บาท`} />
          <Info label="ส่งเมื่อ" value={formatThaiDateTime(batch.createdAt)} />
          {batch.reviewedAt && (
            <Info
              label="ตรวจเมื่อ"
              value={formatThaiDateTime(batch.reviewedAt)}
            />
          )}
        </div>
        {batch.adminNote && (
          <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
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
                  <p className="font-semibold text-white/90">
                    {i + 1}. {fullNameTh(s)}
                  </p>
                  <p className="text-sm text-white/45">{fullNameEn(s)}</p>
                </div>
                {cat && (
                  <span className="shrink-0 rounded-lg bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-200 ring-1 ring-inset ring-brand-400/25">
                    {cat.code}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm text-white/55">
                <span>รุ่น: {cat ? cat.name : "—"}</span>
                <span>ค่าสมัคร: {formatThb(s.feeThbSnapshot)} ฿</span>
                <span>โทร: {s.phone}</span>
                <span>เกิด: {formatThaiDate(s.dob)}</span>
                <span>จังหวัด: {s.province || "—"}</span>
                <span>สถาบัน: {s.instituteName || "—"}</span>
                <span className="col-span-2">
                  PDPA:{" "}
                  {s.pdpaConsent ? (
                    <span className="font-medium text-emerald-300">ยินยอมแล้ว</span>
                  ) : (
                    <span className="text-white/40">ไม่มีข้อมูล</span>
                  )}
                </span>
              </div>
              <div className="mt-3 flex justify-end gap-1 border-t border-white/10 pt-2">
                <button
                  onClick={() => setEditingSeat(s)}
                  disabled={working}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-300 transition hover:bg-brand-500/10 disabled:opacity-50"
                >
                  แก้ไข
                </button>
                <button
                  onClick={() => onDeleteSeat(s)}
                  disabled={working}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
                >
                  ลบ
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* slip + auto verify */}
      {batch.paymentSlipUrl && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white/80">
              สลิปการโอนเงิน
            </h3>
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={onVerifySlip}
              loading={verifying}
            >
              {batch.slipVerifyStatus ? "ตรวจสลิปอีกครั้ง" : "ตรวจสลิปอัตโนมัติ"}
            </Button>
          </div>

          <SlipVerifyBadge
            status={batch.slipVerifyStatus ?? null}
            data={batch.slipVerifyData ?? null}
            expectedAmount={batch.totalAmountThb}
          />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={batch.paymentSlipUrl}
            alt="payment slip"
            className="max-h-96 w-full rounded-2xl object-contain ring-1 ring-white/10"
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

      {/* danger zone — delete the whole registration */}
      <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4">
        <p className="text-sm font-semibold text-rose-200">ลบใบสมัครนี้</p>
        <p className="mt-0.5 text-xs text-white/55">
          ลบทั้งใบ ({seats.length} คน) และคืนที่นั่งกลับเข้าระบบ — ทำแล้วย้อนกลับไม่ได้
        </p>
        <button
          onClick={onDeleteBatch}
          disabled={working}
          className="mt-3 inline-flex h-10 items-center rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          ลบใบสมัครทั้งหมด
        </button>
      </div>

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
        <p className="mb-3 text-sm text-white/55">
          ที่นั่งที่จองไว้จะถูกคืนกลับเข้าระบบ ระบุเหตุผล (ถ้ามี)
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น สลิปไม่ถูกต้อง / ยอดเงินไม่ตรง"
          rows={4}
        />
      </Sheet>

      {editingSeat && (
        <SeatEditSheet
          key={editingSeat.id}
          batchId={batchId}
          seat={editingSeat}
          categories={categories ?? []}
          onClose={() => setEditingSeat(null)}
        />
      )}
    </div>
  );
}

function seatToForm(seat: RegistrationSeat): SeatEditFormValues {
  return {
    titlePrefix: seat.titlePrefix,
    titleCustom: seat.titleCustom ?? "",
    firstNameTh: seat.firstNameTh,
    lastNameTh: seat.lastNameTh,
    firstNameEn: seat.firstNameEn,
    lastNameEn: seat.lastNameEn,
    hasMiddleName: seat.hasMiddleName,
    middleNameTh: seat.middleNameTh ?? "",
    middleNameEn: seat.middleNameEn ?? "",
    phone: seat.phone,
    dob: seat.dob,
    powerLevel: seat.powerLevel == null ? "" : String(seat.powerLevel),
    categoryId: seat.categoryId,
  };
}

function SeatEditSheet({
  batchId,
  seat,
  categories,
  onClose,
}: {
  batchId: string;
  seat: RegistrationSeat;
  categories: Category[];
  onClose: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SeatEditFormValues>({
    resolver: zodResolver(seatEditSchema),
    defaultValues: seatToForm(seat),
  });

  const titlePrefix = watch("titlePrefix");
  const hasMiddle = watch("hasMiddleName");

  async function onSubmit(values: SeatEditFormValues) {
    try {
      await dl.updateSeat(batchId, seat.id, seatEditFormToInput(values), "admin");
      toast.show("บันทึกการแก้ไขแล้ว", "success");
      onClose();
    } catch (e) {
      toast.show(seatErrorMessage((e as Error).message), "error");
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="แก้ไขผู้สมัคร"
      footer={
        <Button
          type="submit"
          form="seat-edit-form"
          fullWidth
          loading={isSubmitting}
        >
          บันทึก
        </Button>
      }
    >
      <form
        id="seat-edit-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="คำนำหน้าชื่อ" required error={errors.titlePrefix?.message}>
            <Select {...register("titlePrefix")} invalid={!!errors.titlePrefix}>
              {TITLE_PREFIXES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          {titlePrefix === "อื่นๆ" && (
            <Field label="ระบุคำนำหน้า" required error={errors.titleCustom?.message}>
              <TextInput {...register("titleCustom")} invalid={!!errors.titleCustom} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ชื่อ (ไทย)" required error={errors.firstNameTh?.message}>
            <TextInput {...register("firstNameTh")} invalid={!!errors.firstNameTh} />
          </Field>
          <Field label="นามสกุล (ไทย)" required error={errors.lastNameTh?.message}>
            <TextInput {...register("lastNameTh")} invalid={!!errors.lastNameTh} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name (English)" required error={errors.firstNameEn?.message}>
            <TextInput
              {...register("firstNameEn")}
              autoCapitalize="words"
              invalid={!!errors.firstNameEn}
            />
          </Field>
          <Field label="Surname (English)" required error={errors.lastNameEn?.message}>
            <TextInput
              {...register("lastNameEn")}
              autoCapitalize="words"
              invalid={!!errors.lastNameEn}
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <Toggle
            checked={!!hasMiddle}
            onChange={(v) =>
              setValue("hasMiddleName", v, { shouldValidate: false })
            }
            label="มีชื่อกลางไหม?"
          />
          {hasMiddle && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="ชื่อกลาง (ไทย)" required error={errors.middleNameTh?.message}>
                <TextInput {...register("middleNameTh")} invalid={!!errors.middleNameTh} />
              </Field>
              <Field label="Middle name (Eng)" required error={errors.middleNameEn?.message}>
                <TextInput
                  {...register("middleNameEn")}
                  autoCapitalize="words"
                  invalid={!!errors.middleNameEn}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="เบอร์โทรศัพท์" required error={errors.phone?.message}>
            <TextInput
              {...register("phone")}
              type="tel"
              inputMode="numeric"
              invalid={!!errors.phone}
            />
          </Field>
          <Field label="วันเดือนปีเกิด" required error={errors.dob?.message}>
            <TextInput {...register("dob")} type="date" invalid={!!errors.dob} />
          </Field>
        </div>

        <Field label="ระดับฝีมือ" error={errors.powerLevel?.message}>
          <Select {...register("powerLevel")} invalid={!!errors.powerLevel}>
            <option value="">— ไม่ระบุ —</option>
            {RANK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="รุ่นที่สมัคร" required error={errors.categoryId?.message}>
          <Select {...register("categoryId")} invalid={!!errors.categoryId}>
            {categories.map((c) => {
              const rem = remainingSeats(c);
              return (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name} — {formatThb(c.feeThb)}฿{" "}
                  {rem === 0 ? "(เต็ม)" : `(เหลือ ${rem})`}
                </option>
              );
            })}
          </Select>
        </Field>

        <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          การย้ายรุ่นจะตรวจระดับฝีมือ + อายุใหม่ และปรับจำนวนที่นั่ง/ยอดเงินให้อัตโนมัติ
        </p>
      </form>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-white/45">{label}: </span>
      <span className="font-medium text-white/80">{value}</span>
    </div>
  );
}

const SLIP_TONE: Record<SlipVerifyStatus, string> = {
  verified: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  amount_mismatch: "border-rose-400/25 bg-rose-500/10 text-rose-200",
  duplicate: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  failed: "border-rose-400/25 bg-rose-500/10 text-rose-200",
  demo: "border-white/15 bg-white/[0.06] text-white/70",
};
const SLIP_ICON: Record<SlipVerifyStatus, string> = {
  verified: "✓",
  amount_mismatch: "⚠",
  duplicate: "⚠",
  failed: "✗",
  demo: "ℹ",
};
const SLIP_TITLE: Record<SlipVerifyStatus, string> = {
  verified: "สลิปถูกต้อง — ยอดตรง",
  amount_mismatch: "ยอดเงินในสลิปไม่ตรง",
  duplicate: "สลิปนี้เคยถูกใช้แล้ว (อาจซ้ำ)",
  failed: "ตรวจสลิปไม่ผ่าน / อ่านสลิปไม่ได้",
  demo: "โหมดทดสอบ (ยังไม่ได้ตั้ง SlipOK API key)",
};

/** Coloured result of the automated slip check. Renders nothing until checked. */
function SlipVerifyBadge({
  status,
  data,
  expectedAmount,
}: {
  status: SlipVerifyStatus | null;
  data: SlipVerifyData | null;
  expectedAmount: number;
}) {
  if (!status) return null;
  return (
    <div className={cn("rounded-xl border p-3 text-sm", SLIP_TONE[status])}>
      <div className="flex items-center gap-2 font-semibold">
        <span>{SLIP_ICON[status]}</span>
        <span>{SLIP_TITLE[status]}</span>
      </div>
      <div className="mt-1.5 space-y-0.5 text-xs">
        {data?.amount != null && (
          <p>
            ยอดในสลิป <b>{formatThb(data.amount)} ฿</b> · ต้องจ่าย{" "}
            {formatThb(expectedAmount)} ฿{" "}
            {data.amountMatches ? "(ตรงกัน)" : "(ไม่ตรง)"}
          </p>
        )}
        {data?.receiver && <p>เข้าบัญชี: {data.receiver}</p>}
        {data?.sender && <p>ผู้โอน: {data.sender}</p>}
        {(data?.transDate || data?.transTime) && (
          <p>
            เวลาโอน: {data?.transDate ?? ""} {data?.transTime ?? ""}
          </p>
        )}
        {data?.transRef && (
          <p className="break-all opacity-70">Ref: {data.transRef}</p>
        )}
        {data?.note && <p className="italic">{data.note}</p>}
        {status === "failed" && data?.message && <p>{data.message}</p>}
      </div>
    </div>
  );
}
