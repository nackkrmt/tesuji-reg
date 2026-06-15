"use client";

import { useFormContext, UseFormRegisterReturn } from "react-hook-form";
import { Category, remainingSeats, TITLE_PREFIXES } from "@/lib/data/types";
import { getByPath, formatThb } from "@/lib/utils";
import { Field, Segmented, Select, TextInput, Toggle } from "@/components/ui/form";
import { RankPicker } from "@/components/register/RankPicker";

export function PersonFields({
  prefix = "",
  categories,
}: {
  prefix?: string;
  categories?: Category[];
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

  return (
    <div className="space-y-4">
      {/* Title prefix */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="คำนำหน้าชื่อ" required error={errMsg("titlePrefix")}>
          <Select {...register(name("titlePrefix"))} invalid={!!errMsg("titlePrefix")}>
            {TITLE_PREFIXES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
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
        <Field label="Name (English)" required error={errMsg("firstNameEn")}>
          <TextInput
            {...register(name("firstNameEn"))}
            placeholder="Somchai"
            autoCapitalize="words"
            invalid={!!errMsg("firstNameEn")}
          />
        </Field>
        <Field label="Surname (English)" required error={errMsg("lastNameEn")}>
          <TextInput
            {...register(name("lastNameEn"))}
            placeholder="Jaidee"
            autoCapitalize="words"
            invalid={!!errMsg("lastNameEn")}
          />
        </Field>
      </div>

      {/* Middle name toggle */}
      <div className="rounded-xl bg-slate-50 p-3">
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
            <Field label="Middle name (Eng)" required error={errMsg("middleNameEn")}>
              <TextInput {...register(name("middleNameEn"))} autoCapitalize="words" invalid={!!errMsg("middleNameEn")} />
            </Field>
          </div>
        )}
      </div>

      {/* Phone */}
      <Field label="เบอร์โทรศัพท์" required error={errMsg("phone")} hint="เบอร์มือถือ 10 หลัก">
        <TextInput
          {...register(name("phone"))}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={12}
          placeholder="0812345678"
          invalid={!!errMsg("phone")}
        />
      </Field>

      {/* Date of birth */}
      <Field label="วันเดือนปีเกิด" required error={errMsg("dob.d") || errMsg("dob.m") || errMsg("dob.y")}>
        <div className="flex items-center gap-2">
          <DobBox
            placeholder="วัน"
            maxLength={2}
            reg={register(name("dob.d"))}
            invalid={!!errMsg("dob.d")}
          />
          <span className="text-slate-300">/</span>
          <DobBox
            placeholder="เดือน"
            maxLength={2}
            reg={register(name("dob.m"))}
            invalid={!!errMsg("dob.m")}
          />
          <span className="text-slate-300">/</span>
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

      {/* Category (only when categories provided) */}
      {categories && (
        <Field label="รุ่นที่ต้องการสมัคร" required error={errMsg("categoryId")}>
          <Select {...register(name("categoryId"))} invalid={!!errMsg("categoryId")}>
            <option value="">— เลือกรุ่น —</option>
            {categories.map((c) => {
              const r = remainingSeats(c);
              return (
                <option key={c.id} value={c.id} disabled={r === 0}>
                  {c.code} · {c.name} — {formatThb(c.feeThb)}฿{" "}
                  {r === 0 ? "(เต็ม)" : `(เหลือ ${r})`}
                </option>
              );
            })}
          </Select>
        </Field>
      )}
    </div>
  );
}

function DobBox({
  reg,
  placeholder,
  maxLength,
  width = "w-16",
  invalid,
}: {
  reg: UseFormRegisterReturn;
  placeholder: string;
  maxLength: number;
  width?: string;
  invalid?: boolean;
}) {
  return (
    <TextInput
      {...reg}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, maxLength);
        reg.onChange(e);
        if (
          e.target.value.length >= maxLength &&
          e.target.nextElementSibling?.nextElementSibling instanceof
            HTMLInputElement
        ) {
          (
            e.target.nextElementSibling.nextElementSibling as HTMLInputElement
          ).focus();
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
