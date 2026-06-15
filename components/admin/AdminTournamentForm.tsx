"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  tournamentConfigSchema,
  TournamentConfigValues,
} from "@/lib/validation/schemas";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import type { Tournament, TournamentStatus } from "@/lib/data/types";
import { isoToLocalInput, localInputToIso } from "@/lib/utils";
import { fileToDownscaledDataUrl, MAX_UPLOAD_BYTES } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Field, Select, TextInput, Textarea } from "@/components/ui/form";
import { CenterLoader, Pill } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { sampleTournamentInput } from "@/lib/demo-seed";

export default function AdminTournamentForm() {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  return (
    <TournamentFormInner
      key={tournament?.id ?? "new"}
      initial={tournament ?? null}
    />
  );
}

function defaults(t: Tournament | null): TournamentConfigValues {
  return {
    nameTh: t?.nameTh ?? "",
    bannerUrl: t?.bannerUrl ?? "",
    competitionDate: t?.competitionDate ?? "",
    locationText: t?.locationText ?? "",
    locationMapsUrl: t?.locationMapsUrl ?? "",
    registrationOpensAt: t ? isoToLocalInput(t.registrationOpensAt) : "",
    registrationClosesAt: t ? isoToLocalInput(t.registrationClosesAt) : "",
    scheduleText: t?.scheduleText ?? "",
    rulesText: t?.rulesText ?? "",
    promptpayTargetType: t?.promptpayTargetType ?? "phone",
    promptpayTargetValue: t?.promptpayTargetValue ?? "",
  };
}

function TournamentFormInner({ initial }: { initial: Tournament | null }) {
  const dl = useDataLayer();
  const toast = useToast();
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState<TournamentStatus>(
    initial?.status ?? "draft",
  );
  const [bannerUploading, setBannerUploading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TournamentConfigValues>({
    resolver: zodResolver(tournamentConfigSchema),
    defaultValues: defaults(initial),
  });

  const bannerUrl = watch("bannerUrl");
  const ppType = watch("promptpayTargetType");

  async function onSubmit(values: TournamentConfigValues) {
    const saved = await dl.upsertTournament({
      id: savedId ?? undefined,
      nameTh: values.nameTh,
      bannerUrl: values.bannerUrl || null,
      competitionDate: values.competitionDate,
      locationText: values.locationText,
      locationMapsUrl: values.locationMapsUrl || "",
      registrationOpensAt: localInputToIso(values.registrationOpensAt),
      registrationClosesAt: localInputToIso(values.registrationClosesAt),
      scheduleText: values.scheduleText,
      rulesText: values.rulesText,
      promptpayTargetType: values.promptpayTargetType,
      promptpayTargetValue: values.promptpayTargetValue.replace(/[\s-]/g, ""),
      status,
    });
    setSavedId(saved.id);
    setStatus(saved.status);
    toast.show("บันทึกข้อมูลรายการแล้ว", "success");
  }

  async function onBanner(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)", "error");
      return;
    }
    setBannerUploading(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, 1280, 0.8);
      setValue("bannerUrl", dataUrl, { shouldDirty: true });
    } finally {
      setBannerUploading(false);
    }
  }

  async function changeStatus(next: TournamentStatus) {
    if (!savedId) {
      toast.show("กรุณาบันทึกข้อมูลก่อนเผยแพร่", "error");
      return;
    }
    await dl.setTournamentStatus(savedId, next);
    setStatus(next);
    toast.show(
      next === "published" ? "เผยแพร่รายการแล้ว" : "อัปเดตสถานะแล้ว",
      "success",
    );
  }

  function fillSample() {
    reset(defaults(null));
    const s = sampleTournamentInput();
    reset({
      nameTh: s.nameTh,
      bannerUrl: "",
      competitionDate: s.competitionDate,
      locationText: s.locationText,
      locationMapsUrl: s.locationMapsUrl,
      registrationOpensAt: isoToLocalInput(s.registrationOpensAt),
      registrationClosesAt: isoToLocalInput(s.registrationClosesAt),
      scheduleText: s.scheduleText,
      rulesText: s.rulesText,
      promptpayTargetType: s.promptpayTargetType,
      promptpayTargetValue: s.promptpayTargetValue,
    });
    toast.show("ใส่ข้อมูลตัวอย่างแล้ว — กดบันทึกเพื่อใช้งาน", "info");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* status bar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">สถานะรายการ:</span>
          <Pill
            tone={
              status === "published"
                ? "good"
                : status === "closed"
                  ? "bad"
                  : "neutral"
            }
          >
            {status === "published"
              ? "เผยแพร่ (เปิดรับสมัคร)"
              : status === "closed"
                ? "ปิดรับสมัคร"
                : "แบบร่าง"}
          </Pill>
        </div>
        <div className="flex gap-2">
          {status !== "published" && (
            <Button
              type="button"
              variant="success"
              className="h-9 px-3 text-sm"
              onClick={() => changeStatus("published")}
            >
              เผยแพร่
            </Button>
          )}
          {status === "published" && (
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={() => changeStatus("closed")}
            >
              ปิดรับสมัคร
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-sm"
            onClick={fillSample}
          >
            ใส่ข้อมูลตัวอย่าง
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>ข้อมูลรายการแข่งขัน</SectionTitle>
        <Field label="ชื่อรายการแข่งขัน" required error={errors.nameTh?.message}>
          <TextInput {...register("nameTh")} placeholder="เช่น การแข่งขันหมากล้อม..." invalid={!!errors.nameTh} />
        </Field>

        {/* banner */}
        <Field label="ภาพแบนเนอร์" hint="อัปโหลดรูป หรือวางลิงก์รูปภาพก็ได้">
          <div className="space-y-2">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl}
                alt="banner preview"
                className="h-36 w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-36 w-full items-center justify-center rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 text-sm text-white/70">
                ยังไม่มีแบนเนอร์
              </div>
            )}
            <div className="flex gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {bannerUploading ? "กำลังประมวลผล…" : "อัปโหลดรูป"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onBanner(f);
                  }}
                />
              </label>
              {bannerUrl && (
                <button
                  type="button"
                  onClick={() => setValue("bannerUrl", "", { shouldDirty: true })}
                  className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  ลบรูป
                </button>
              )}
            </div>
            <TextInput
              {...register("bannerUrl")}
              placeholder="https://… (ลิงก์รูปภาพ)"
            />
          </div>
        </Field>

        <Field label="วันที่แข่งขัน" required error={errors.competitionDate?.message}>
          <TextInput {...register("competitionDate")} placeholder="เช่น 14–15 กันยายน 2568" invalid={!!errors.competitionDate} />
        </Field>
        <Field label="สถานที่แข่งขัน" required error={errors.locationText?.message}>
          <TextInput {...register("locationText")} placeholder="ชื่อสถานที่ / ห้อง / อาคาร" invalid={!!errors.locationText} />
        </Field>
        <Field label="ลิงก์ Google Maps" error={errors.locationMapsUrl?.message} hint="วางลิงก์จาก Google Maps">
          <TextInput {...register("locationMapsUrl")} placeholder="https://maps.google.com/?q=…" inputMode="url" invalid={!!errors.locationMapsUrl} />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>ช่วงเวลารับสมัคร</SectionTitle>
        <Field label="เปิดรับสมัคร" required error={errors.registrationOpensAt?.message}>
          <TextInput type="datetime-local" {...register("registrationOpensAt")} invalid={!!errors.registrationOpensAt} />
        </Field>
        <Field label="ปิดรับสมัคร" required error={errors.registrationClosesAt?.message}>
          <TextInput type="datetime-local" {...register("registrationClosesAt")} invalid={!!errors.registrationClosesAt} />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>การชำระเงิน (PromptPay)</SectionTitle>
        <Field label="ประเภทบัญชี PromptPay">
          <Select {...register("promptpayTargetType")}>
            <option value="phone">เบอร์โทรศัพท์</option>
            <option value="national_id">เลขบัตรประชาชน</option>
          </Select>
        </Field>
        <Field
          label={ppType === "phone" ? "เบอร์ PromptPay" : "เลขบัตรประชาชน"}
          required
          error={errors.promptpayTargetValue?.message}
          hint="ใช้สร้าง QR ชำระเงินแบบล็อกจำนวนเงิน"
        >
          <TextInput
            {...register("promptpayTargetValue")}
            inputMode="numeric"
            placeholder={ppType === "phone" ? "0812345678" : "1234567890123"}
            invalid={!!errors.promptpayTargetValue}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>กำหนดการ และ กฎ กติกา</SectionTitle>
        <Field label="กำหนดการ" hint="แต่ละบรรทัดจะแสดงเป็นรายการ">
          <Textarea {...register("scheduleText")} rows={6} placeholder="08:00 ลงทะเบียน…" />
        </Field>
        <Field label="กฎ กติกา" hint="แต่ละบรรทัดจะแสดงเป็นรายการ">
          <Textarea {...register("rulesText")} rows={6} placeholder="1. ใช้กติกาสากล…" />
        </Field>
      </Card>

      <Button type="submit" fullWidth loading={isSubmitting}>
        บันทึกข้อมูลรายการ
      </Button>
    </form>
  );
}
