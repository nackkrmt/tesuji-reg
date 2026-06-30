"use client";

import { useMemo, useState } from "react";
import { useFormContext, UseFormRegisterReturn } from "react-hook-form";
import { Category, remainingSeats, TITLE_PREFIXES } from "@/lib/data/types";
import { getByPath, formatThb } from "@/lib/utils";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { THAI_PROVINCES } from "@/lib/provinces";
import { Field, Segmented, TextInput, Toggle } from "@/components/ui/form";
import { Combobox } from "@/components/ui/Combobox";
import { RankPicker } from "@/components/register/RankPicker";

export function PersonFields({
  prefix = "",
  categories,
  ownerDefaults,
}: {
  prefix?: string;
  categories?: Category[];
  /**
   * When provided (e.g. adding a player under one's account), shows a
   * "เหมือนเจ้าของบัญชี" option on the phone and institute fields that fills
   * them from the logged-in account owner's profile. Omit for the owner's own
   * profile form, where the option is meaningless.
   */
  ownerDefaults?: {
    phone?: string | null;
    province?: string | null;
    instituteId?: string | null;
    instituteName?: string | null;
  } | null;
}) {
  // The form context is shared with the page-level RHF form; using the default
  // (untyped) FieldValues lets the same component work for single (prefix "")
  // and array (prefix "people.0.") usages.
  const { register, watch, setValue, formState } = useFormContext();
  const errors = formState.errors;
  const name = (n: string) => `${prefix}${n}`;
  const errMsg = (n: string): string | undefined => {
    const e = getByPath(errors, name(n)) as { message?: string } | undefined;
    return e?.message;
  };

  const titlePrefix = watch(name("titlePrefix"));
  const hasMiddle = watch(name("hasMiddleName"));
  const era = (watch(name("dob.era")) as "CE" | "BE") ?? "CE";

  // Residence province + Go institute + PDPA consent
  const dl = useDataLayer();
  const { data: institutes } = useLiveQuery((d) => d.listInstitutes(), []);
  const province = (watch(name("province")) as string) ?? "";
  const instituteId = (watch(name("instituteId")) as string | null) ?? null;
  const instituteName = (watch(name("instituteName")) as string) ?? "";
  const pdpaConsent = !!watch(name("pdpaConsent"));

  // "เหมือนเจ้าของบัญชี" — fill phone / institute from the account owner.
  const ownerPhone = (ownerDefaults?.phone ?? "").trim();
  const ownerProvince = (ownerDefaults?.province ?? "").trim();
  const ownerInstId = ownerDefaults?.instituteId ?? null;
  const ownerInstName = (ownerDefaults?.instituteName ?? "").trim();
  const hasOwnerPhone = !!ownerPhone;
  const hasOwnerProvince = !!ownerProvince;
  const hasOwnerInstitute = !!(ownerInstId || ownerInstName);

  // Start "checked" when the current value already matches the owner's (e.g.
  // editing a player who shares the owner's phone/institute).
  const [phoneSameAsOwner, setPhoneSameAsOwner] = useState(
    () => hasOwnerPhone && ((watch(name("phone")) as string) ?? "") === ownerPhone,
  );
  const [provinceSameAsOwner, setProvinceSameAsOwner] = useState(
    () => hasOwnerProvince && province === ownerProvince,
  );
  const [instSameAsOwner, setInstSameAsOwner] = useState(
    () =>
      hasOwnerInstitute &&
      (ownerInstId ? instituteId === ownerInstId : instituteName === ownerInstName),
  );

  const provinceOptions = useMemo(
    () => THAI_PROVINCES.map((p) => ({ value: p, label: p })),
    [],
  );
  const instituteOptions = useMemo(() => {
    const opts = (institutes ?? []).map((i) => ({ value: i.id, label: i.nameTh }));
    // keep a previously-chosen institute visible even if it's not in the active list
    if (instituteId && instituteName && !opts.some((o) => o.value === instituteId)) {
      opts.unshift({ value: instituteId, label: instituteName });
    }
    return opts;
  }, [institutes, instituteId, instituteName]);

  return (
    <div className="space-y-4">
      {/* Title prefix */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="คำนำหน้าชื่อ" required error={errMsg("titlePrefix")}>
          <Combobox
            value={titlePrefix ?? ""}
            onChange={(v) =>
              setValue(name("titlePrefix"), v, { shouldValidate: true })
            }
            options={TITLE_PREFIXES.map((t) => ({ value: t, label: t }))}
            invalid={!!errMsg("titlePrefix")}
            searchable={false}
          />
        </Field>
        {titlePrefix === "อื่นๆ" && (
          <Field label="ระบุคำนำหน้า" required error={errMsg("titleCustom")}>
            <TextInput
              {...register(name("titleCustom"))}
              placeholder="เช่น ดร."
              invalid={!!errMsg("titleCustom")}
            />
          </Field>
        )}
      </div>

      {/* Thai name */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="ชื่อ (ไทย)" required error={errMsg("firstNameTh")}>
          <TextInput {...register(name("firstNameTh"))} placeholder="สมชาย" invalid={!!errMsg("firstNameTh")} />
        </Field>
        <Field label="นามสกุล (ไทย)" required error={errMsg("lastNameTh")}>
          <TextInput {...register(name("lastNameTh"))} placeholder="ใจดี" invalid={!!errMsg("lastNameTh")} />
        </Field>
      </div>

      {/* English name */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name (English)" hint="ไม่บังคับ · เติมภายหลังได้" error={errMsg("firstNameEn")}>
          <TextInput
            {...register(name("firstNameEn"))}
            placeholder="Somchai"
            autoCapitalize="words"
            invalid={!!errMsg("firstNameEn")}
          />
        </Field>
        <Field label="Surname (English)" error={errMsg("lastNameEn")}>
          <TextInput
            {...register(name("lastNameEn"))}
            placeholder="Jaidee"
            autoCapitalize="words"
            invalid={!!errMsg("lastNameEn")}
          />
        </Field>
      </div>

      {/* Middle name toggle */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <Toggle
          checked={!!hasMiddle}
          onChange={(v) =>
            setValue(name("hasMiddleName"), v, { shouldValidate: false })
          }
          label="มีชื่อกลางไหม?"
        />
        {hasMiddle && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="ชื่อกลาง (ไทย)" required error={errMsg("middleNameTh")}>
              <TextInput {...register(name("middleNameTh"))} invalid={!!errMsg("middleNameTh")} />
            </Field>
            <Field label="Middle name (Eng)" error={errMsg("middleNameEn")}>
              <TextInput {...register(name("middleNameEn"))} autoCapitalize="words" invalid={!!errMsg("middleNameEn")} />
            </Field>
          </div>
        )}
      </div>

      {/* Phone */}
      <Field label="เบอร์โทรศัพท์" required error={errMsg("phone")} hint="เบอร์มือถือ 10 หลัก">
        {hasOwnerPhone && (
          <SameAsOwner
            checked={phoneSameAsOwner}
            onChange={(v) => {
              setPhoneSameAsOwner(v);
              if (v)
                setValue(name("phone"), ownerPhone, { shouldValidate: true });
            }}
          />
        )}
        <TextInput
          {...register(name("phone"))}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={12}
          placeholder="0812345678"
          invalid={!!errMsg("phone")}
          disabled={phoneSameAsOwner}
          className={phoneSameAsOwner ? "opacity-60" : undefined}
        />
      </Field>

      {/* Date of birth */}
      <Field label="วันเดือนปีเกิด" required error={errMsg("dob.d") || errMsg("dob.m") || errMsg("dob.y")}>
        <div className="flex items-center gap-2">
          <DobBox
            placeholder="วัน"
            maxLength={2}
            maxValue={31}
            reg={register(name("dob.d"))}
            invalid={!!errMsg("dob.d")}
          />
          <span className="text-white/30">/</span>
          <DobBox
            placeholder="เดือน"
            maxLength={2}
            maxValue={12}
            reg={register(name("dob.m"))}
            invalid={!!errMsg("dob.m")}
          />
          <span className="text-white/30">/</span>
          <DobBox
            placeholder="ปี"
            maxLength={4}
            width="w-24"
            reg={register(name("dob.y"))}
            invalid={!!errMsg("dob.y")}
          />
          <Segmented
            className="ml-1"
            value={era}
            onChange={(v) => setValue(name("dob.era"), v, { shouldValidate: false })}
            options={[
              { value: "CE", label: "ค.ศ." },
              { value: "BE", label: "พ.ศ." },
            ]}
          />
        </div>
      </Field>

      {/* Go rank — search DB to verify, or self-declare (pending approval) */}
      <RankPicker prefix={prefix} />

      {/* Residence province (searchable) */}
      <Field label="จังหวัดที่อาศัย" required error={errMsg("province")}>
        {hasOwnerProvince && (
          <SameAsOwner
            checked={provinceSameAsOwner}
            onChange={(v) => {
              setProvinceSameAsOwner(v);
              if (v)
                setValue(name("province"), ownerProvince, {
                  shouldValidate: true,
                });
            }}
          />
        )}
        {provinceSameAsOwner ? (
          <div className="w-full rounded-2xl glass-input px-3.5 py-3 text-white/70 opacity-60">
            {ownerProvince || "—"}
          </div>
        ) : (
          <Combobox
            value={province || null}
            onChange={(v) => setValue(name("province"), v, { shouldValidate: true })}
            options={provinceOptions}
            placeholder="— เลือกจังหวัด —"
            searchPlaceholder="ค้นหาจังหวัด…"
            emptyText="ไม่พบจังหวัด"
            invalid={!!errMsg("province")}
          />
        )}
      </Field>

      {/* Go institute (searchable + create-new) */}
      <Field
        label="สถาบันหมากล้อมที่ศึกษา"
        required
        error={errMsg("instituteName")}
        hint="พิมพ์เพื่อค้นหา หรือเพิ่มสถาบันใหม่ได้"
      >
        {hasOwnerInstitute && (
          <SameAsOwner
            checked={instSameAsOwner}
            onChange={(v) => {
              setInstSameAsOwner(v);
              if (v) {
                setValue(name("instituteId"), ownerInstId, {
                  shouldValidate: true,
                });
                setValue(name("instituteName"), ownerInstName, {
                  shouldValidate: true,
                });
              }
            }}
          />
        )}
        {instSameAsOwner ? (
          <div className="w-full rounded-2xl glass-input px-3.5 py-3 text-white/70 opacity-60">
            {ownerInstName || "—"}
          </div>
        ) : (
          <Combobox
            value={instituteId}
            onChange={(v) => {
              const found = (institutes ?? []).find((i) => i.id === v);
              setValue(name("instituteId"), v, { shouldValidate: true });
              setValue(name("instituteName"), found?.nameTh ?? instituteName, {
                shouldValidate: true,
              });
            }}
            options={instituteOptions}
            placeholder="— เลือกสถาบัน —"
            searchPlaceholder="ค้นหาหรือพิมพ์ชื่อสถาบัน…"
            emptyText="ยังไม่มีสถาบันในระบบ — พิมพ์เพื่อเพิ่มใหม่"
            invalid={!!errMsg("instituteName")}
            allowCreate
            createLabel={(q) => `+ เพิ่มสถาบัน “${q}”`}
            onCreate={async (q) => {
              const inst = await dl.findOrCreateInstitute(q);
              setValue(name("instituteId"), inst.id, { shouldValidate: true });
              setValue(name("instituteName"), inst.nameTh, {
                shouldValidate: true,
              });
            }}
          />
        )}
      </Field>

      {/* PDPA consent */}
      <Field error={errMsg("pdpaConsent")}>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <input
            type="checkbox"
            checked={pdpaConsent}
            onChange={(e) =>
              setValue(name("pdpaConsent"), e.target.checked, {
                shouldValidate: true,
              })
            }
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500"
          />
          <span className="text-sm text-white/70">
            ข้าพเจ้ายินยอมให้เก็บรวบรวมและใช้ข้อมูลส่วนบุคคลเพื่อการสมัครและจัดการแข่งขัน
            ตามนโยบายความเป็นส่วนตัว (PDPA)
            <span className="ml-0.5 text-rose-400">*</span>
          </span>
        </label>
      </Field>

      {/* Category (only when categories provided) */}
      {categories && (
        <Field label="รุ่นที่ต้องการสมัคร" required error={errMsg("categoryId")}>
          <Combobox
            value={(watch(name("categoryId")) as string) ?? ""}
            onChange={(v) =>
              setValue(name("categoryId"), v, { shouldValidate: true })
            }
            options={[
              { value: "", label: "— เลือกรุ่น —" },
              ...categories.map((c) => {
                const r = remainingSeats(c);
                return {
                  value: c.id,
                  label: `${c.code} · ${c.name} — ${formatThb(c.feeThb)}฿ ${
                    r === 0 ? "(เต็ม)" : `(เหลือ ${r})`
                  }`,
                  disabled: r === 0,
                };
              }),
            ]}
            invalid={!!errMsg("categoryId")}
          />
        </Field>
      )}
    </div>
  );
}

/** Inline "ใช้ข้อมูลเดียวกับเจ้าของบัญชี" checkbox shown above a field. */
function SameAsOwner({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-white/55">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-500"
      />
      เหมือนเจ้าของบัญชี
    </label>
  );
}

function DobBox({
  reg,
  placeholder,
  maxLength,
  maxValue,
  width = "w-16",
  invalid,
}: {
  reg: UseFormRegisterReturn;
  placeholder: string;
  maxLength: number;
  /** Largest valid number (e.g. 31 for day, 12 for month). When the typed value
   *  can no longer be extended into a valid number, jump to the next box — so
   *  "9" in the day box advances immediately (no day starts 90–99). */
  maxValue?: number;
  width?: string;
  invalid?: boolean;
}) {
  return (
    <TextInput
      {...reg}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, "").slice(0, maxLength);
        // Cap the value so the day can't exceed 31 and the month can't exceed 12.
        if (maxValue != null && val !== "" && Number(val) > maxValue) {
          val = String(maxValue);
        }
        e.target.value = val;
        reg.onChange(e);
        // "9" in the day box can't be extended (no day is 90–99) → it's complete.
        const cannotExtend =
          maxValue != null && val.length > 0 && Number(val) * 10 > maxValue;
        if (val.length >= maxLength || cannotExtend) {
          // Jump to the next <input> in the same row — robust to the "/" spans
          // and the era toggle (which has no input) between the date boxes.
          const inputs = Array.from(
            e.target.parentElement?.querySelectorAll<HTMLInputElement>(
              "input",
            ) ?? [],
          );
          const next = inputs[inputs.indexOf(e.target) + 1];
          next?.focus();
          next?.select();
        }
      }}
      inputMode="numeric"
      maxLength={maxLength}
      placeholder={placeholder}
      className={`${width} no-spinner text-center`}
      invalid={invalid}
    />
  );
}
