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
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, TextInput } from "@/components/ui/form";
import { Combobox } from "@/components/ui/Combobox";
import { Sheet } from "@/components/ui/Sheet";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { CenterLoader, CodeChip, EmptyState, Pill } from "@/components/ui/feedback";
import { RowAction } from "@/components/ui/RowAction";
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
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function onDelete(c: Category) {
    setDeleteTarget(c);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await dl.deleteCategory(deleteTarget.id);
      toast.show("ลบรุ่นแล้ว", "success");
      setDeleteTarget(null);
    } catch (e) {
      const msg = (e as Error).message;
      toast.show(
        msg === "CATEGORY_IN_USE"
          ? "ลบไม่ได้ — มีผู้สมัครในรุ่นนี้แล้ว"
          : "เกิดข้อผิดพลาด",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="รุ่นการแข่งขัน"
        description={`รุ่นที่เปิดรับสมัคร ${categories?.length ?? 0} รุ่น`}
        action={
          <Button size="sm" onClick={openAdd}>
            + เพิ่มรุ่น
          </Button>
        }
      />

      {(categories?.length ?? 0) === 0 ? (
        <EmptyState
          title="ยังไม่มีรุ่น"
          description="กดปุ่ม “เพิ่มรุ่น” เพื่อสร้างรุ่นแรก"
          action={
            <Button size="sm" onClick={openAdd}>
              + เพิ่มรุ่น
            </Button>
          }
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
                      <CodeChip>{c.code}</CodeChip>
                      <p className="truncate font-semibold text-white/90">
                        {c.name}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-white/55">
                      ค่าสมัคร {formatThb(c.feeThb)} บาท
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                      รับระดับ: {bandLabel(c.minPowerLevel, c.maxPowerLevel)}
                    </p>
                    {ageBandLabel(c.minAge, c.maxAge) && (
                      <p className="mt-1 text-xs text-white/55">
                        อายุ: {ageBandLabel(c.minAge, c.maxAge)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <RowAction tone="brand" onClick={() => openEdit(c)}>
                      แก้ไข
                    </RowAction>
                    <RowAction tone="danger" onClick={() => onDelete(c)}>
                      ลบ
                    </RowAction>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.07] pt-3 text-xs">
                  <Pill>
                    <b className="font-bold">{c.capacity}</b>{" "}
                    <span className="font-medium">เปิดรับ</span>
                  </Pill>
                  <Pill tone={s && s.remaining > 0 ? "good" : "bad"}>
                    <b className="font-bold">{s?.remaining ?? c.capacity}</b>{" "}
                    <span className="font-medium">เหลือ</span>
                  </Pill>
                  <Pill tone="warn">
                    <b className="font-bold">{s?.held ?? 0}</b>{" "}
                    <span className="font-medium">จอง</span>
                  </Pill>
                  <Pill tone="good">
                    <b className="font-bold">{s?.confirmed ?? 0}</b>{" "}
                    <span className="font-medium">ยืนยันแล้ว</span>
                  </Pill>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CategoryFormSheet
        key={editing ? `edit-${editing.id}` : "new"}
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        tournamentId={tournament.id}
        allCategories={categories ?? []}
      />

      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="ลบรุ่น"
        description={
          deleteTarget
            ? `ลบ “${deleteTarget.code} ${deleteTarget.name}” ออกจากรายการรุ่น?`
            : undefined
        }
        confirmLabel="ลบรุ่น"
        loading={deleting}
      />
    </div>
  );
}

function CategoryFormSheet({
  open,
  onClose,
  editing,
  tournamentId,
  allCategories,
}: {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
  tournamentId: string;
  allCategories: Category[];
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
      combinableCategoryIds: editing?.combinableCategoryIds ?? [],
    },
  });

  // Other รุ่น (exclude the one being edited) offered as combinable companions.
  const otherCategories = allCategories.filter((c) => c.id !== editing?.id);
  const combinable = watch("combinableCategoryIds") ?? [];
  function toggleCombinable(id: string) {
    const next = combinable.includes(id)
      ? combinable.filter((x) => x !== id)
      : [...combinable, id];
    setValue("combinableCategoryIds", next, { shouldDirty: true });
  }

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
        combinableCategoryIds: values.combinableCategoryIds,
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
          <p className="mb-1.5 text-sm font-medium text-white/80">
            รับระดับฝีมือ
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ตั้งแต่" error={errors.minPowerLevel?.message}>
              <Combobox
                value={(watch("minPowerLevel") as string) ?? ""}
                onChange={(v) =>
                  setValue("minPowerLevel", v, { shouldValidate: true })
                }
                options={RANK_BOUND_OPTIONS}
              />
            </Field>
            <Field label="ถึง" error={errors.maxPowerLevel?.message}>
              <Combobox
                value={(watch("maxPowerLevel") as string) ?? ""}
                onChange={(v) =>
                  setValue("maxPowerLevel", v, { shouldValidate: true })
                }
                options={RANK_BOUND_OPTIONS}
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-white/45">
            เว้น “ไม่จำกัด” ทั้งสองช่อง = รับทุกระดับ
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-white/80">
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
          <p className="mt-1 text-xs text-white/45">
            เว้นว่างทั้งสองช่อง = ไม่จำกัดอายุ · คิดอายุเต็มปี ณ วันที่สมัคร
          </p>
        </div>

        {otherCategories.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-white/80">
              ลงคู่กับรุ่นไหนได้บ้าง
            </p>
            <div className="space-y-2">
              {otherCategories.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/[0.06]"
                >
                  <input
                    type="checkbox"
                    checked={combinable.includes(c.id)}
                    onChange={() => toggleCombinable(c.id)}
                    className="h-4 w-4 accent-brand-500"
                  />
                  <span className="font-medium text-white/80">{c.code}</span>
                  <span className="truncate text-white/55">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-white/45">
              ผู้เล่นจะลงรุ่นนี้พร้อมรุ่นที่เลือกไว้ได้ (เช่น 9x9 + 13x13) ·
              ไม่เลือกเลย = รุ่นนี้ลงได้รุ่นเดียว
            </p>
          </div>
        )}
      </form>
    </Sheet>
  );
}
