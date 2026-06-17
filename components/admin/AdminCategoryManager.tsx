"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ageValueToInt,
  bandValueToPower,
  categorySchema,
  CategoryFormValues,
} from "@/lib/validation/schemas";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import type { Category, CategoryStat } from "@/lib/data/types";
import { bandLabel, RANK_BOUND_OPTIONS } from "@/lib/rank";
import { ageBandLabel } from "@/lib/age";
import { formatThb } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

export default function AdminCategoryManager() {
  const dl = useDataLayer();
  const toast = useToast();
  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: categories, loading: cLoading } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );
  const { data: stats } = useLiveQuery(
    (d) => (tid ? d.listCategoryStats(tid) : Promise.resolve([])),
    [tid],
  );

  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  const statMap = useMemo(() => {
    const m: Record<string, CategoryStat> = {};
    (stats ?? []).forEach((s) => (m[s.categoryId] = s));
    return m;
  }, [stats]);

  if (tLoading || cLoading) return <CenterLoader label="กำลังโหลด…" />;

  if (!tournament) {
    return (
      <EmptyState
        title="ยังไม่มีรายการแข่งขัน"
        description="กรุณาสร้างข้อมูลรายการในแท็บ “ทัวร์นาเมนต์” ก่อน"
      />
    );
  }

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setOpen(true);
  }

  async function onDelete(c: Category) {
    if (!window.confirm(`ลบรุ่น "${c.code} ${c.name}" ?`)) return;
    try {
      await dl.deleteCategory(c.id);
      toast.show("ลบรุ่นแล้ว", "success");
    } catch (e) {
      const msg = (e as Error).message;
      toast.show(
        msg === "CATEGORY_IN_USE"
          ? "ลบไม่ได้ — มีผู้สมัครในรุ่นนี้แล้ว"
          : "เกิดข้อผิดพลาด",
        "error",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          รุ่นที่เปิดรับสมัคร {categories?.length ?? 0} รุ่น
        </p>
        <Button className="h-10 px-4 text-sm" onClick={openAdd}>
          + เพิ่มรุ่น
        </Button>
      </div>

      {(categories?.length ?? 0) === 0 ? (
        <EmptyState
          title="ยังไม่มีรุ่น"
          description="กดปุ่ม “เพิ่มรุ่น” เพื่อสร้างรุ่นแรก"
        />
      ) : (
        <div className="space-y-3">
          {categories!.map((c) => {
            const s = statMap[c.id];
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                        {c.code}
                      </span>
                      <p className="truncate font-semibold text-slate-800">
                        {c.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-400">
                      ค่าสมัคร {formatThb(c.feeThb)} บาท
                    </p>
                    <p className="mt-0.5 text-xs text-brand-600">
                      รับระดับ: {bandLabel(c.minPowerLevel, c.maxPowerLevel)}
                    </p>
                    {ageBandLabel(c.minAge, c.maxAge) && (
                      <p className="mt-0.5 text-xs text-brand-600">
                        อายุ: {ageBandLabel(c.minAge, c.maxAge)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      แก้ไข
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Pill>เปิดรับ {c.capacity}</Pill>
                  <Pill tone={s && s.remaining > 0 ? "good" : "bad"}>
                    เหลือ {s?.remaining ?? c.capacity}
                  </Pill>
                  <Pill tone="warn">จอง {s?.held ?? 0}</Pill>
                  <Pill tone="good">ยืนยันแล้ว {s?.confirmed ?? 0}</Pill>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CategoryFormSheet
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        tournamentId={tournament.id}
      />
    </div>
  );
}

function CategoryFormSheet({
  open,
  onClose,
  editing,
  tournamentId,
}: {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
  tournamentId: string;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      code: editing?.code ?? "",
      name: editing?.name ?? "",
      capacity: editing?.capacity ?? 0,
      feeThb: editing?.feeThb ?? 0,
      minPowerLevel:
        editing?.minPowerLevel != null ? String(editing.minPowerLevel) : "",
      maxPowerLevel:
        editing?.maxPowerLevel != null ? String(editing.maxPowerLevel) : "",
      minAge: editing?.minAge != null ? String(editing.minAge) : "",
      maxAge: editing?.maxAge != null ? String(editing.maxAge) : "",
    },
  });

  async function onSubmit(values: CategoryFormValues) {
    try {
      await dl.upsertCategory({
        id: editing?.id,
        tournamentId,
        code: values.code,
        name: values.name,
        capacity: values.capacity,
        feeThb: values.feeThb,
        minPowerLevel: bandValueToPower(values.minPowerLevel),
        maxPowerLevel: bandValueToPower(values.maxPowerLevel),
        minAge: ageValueToInt(values.minAge),
        maxAge: ageValueToInt(values.maxAge),
        sortOrder: editing?.sortOrder,
      });
      toast.show(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรุ่นแล้ว", "success");
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "DUPLICATE_CODE") toast.show("รหัสรุ่นนี้มีอยู่แล้ว", "error");
      else if (msg === "CAPACITY_BELOW_TAKEN")
        toast.show(
          `ลดจำนวนรับไม่ได้ — มีการจอง/ยืนยันไปแล้ว ${(e as Error & { taken?: number }).taken ?? ""} ที่`,
          "error",
        );
      else toast.show("เกิดข้อผิดพลาด", "error");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "แก้ไขรุ่น" : "เพิ่มรุ่น"}
      footer={
        <Button
          type="submit"
          form="category-form"
          fullWidth
          loading={isSubmitting}
        >
          {editing ? "บันทึก" : "เพิ่มรุ่น"}
        </Button>
      }
    >
      <form
        id="category-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="รหัสรุ่น" required error={errors.code?.message} className="col-span-1">
            <TextInput {...register("code")} placeholder="A" invalid={!!errors.code} />
          </Field>
          <Field label="ชื่อรุ่น" required error={errors.name?.message} className="col-span-2">
            <TextInput {...register("name")} placeholder="รุ่นบุคคลทั่วไป" invalid={!!errors.name} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="จำนวนที่เปิดรับ" required error={errors.capacity?.message}>
            <TextInput
              {...register("capacity")}
              type="number"
              inputMode="numeric"
              min={0}
              className="no-spinner"
              invalid={!!errors.capacity}
            />
          </Field>
          <Field label="ค่าสมัคร (บาท)" required error={errors.feeThb?.message}>
            <TextInput
              {...register("feeThb")}
              type="number"
              inputMode="numeric"
              min={0}
              className="no-spinner"
              invalid={!!errors.feeThb}
            />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            รับระดับฝีมือ
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ตั้งแต่" error={errors.minPowerLevel?.message}>
              <Select {...register("minPowerLevel")}>
                {RANK_BOUND_OPTIONS.map((o) => (
                  <option key={`min-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ถึง" error={errors.maxPowerLevel?.message}>
              <Select {...register("maxPowerLevel")}>
                {RANK_BOUND_OPTIONS.map((o) => (
                  <option key={`max-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            เว้น “ไม่จำกัด” ทั้งสองช่อง = รับทุกระดับ
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            จำกัดอายุ (ปี)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ตั้งแต่" error={errors.minAge?.message}>
              <TextInput
                {...register("minAge")}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="ไม่จำกัด"
                className="no-spinner"
                invalid={!!errors.minAge}
              />
            </Field>
            <Field label="ถึง" error={errors.maxAge?.message}>
              <TextInput
                {...register("maxAge")}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="ไม่จำกัด"
                className="no-spinner"
                invalid={!!errors.maxAge}
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            เว้นว่างทั้งสองช่อง = ไม่จำกัดอายุ · คิดอายุเต็มปี ณ วันที่สมัคร
          </p>
        </div>
      </form>
    </Sheet>
  );
}
