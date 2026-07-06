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
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
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
    const opts = (institutes ?? []).map((i) => ({
      value: i.id,
      label: i.nameTh,
      keywords: i.keywords,
    }));
    // keep a previously-chosen institute visible even if it's not in the active list
    if (instituteId && instituteName && !opts.some((o) => o.value === instituteId)) {
      opts.unshift({ value: instituteId, label: instituteName, keywords: [] });
    }
    return opts;
  }, [institutes, instituteId, instituteName]);

  return (
    <div className="space-y-4">
      {/* Title prefix */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.person.titlePrefix} required error={errMsg("titlePrefix")}>
          <Combobox
            value={titlePrefix ?? ""}
            onChange={(v) =>
              setValue(name("titlePrefix"), v, { shouldValidate: true })
            }
            options={TITLE_PREFIXES.map((tp) => ({ value: tp, label: tp }))}
            invalid={!!errMsg("titlePrefix")}
            searchable={false}
          />
        </Field>
        {titlePrefix === t.person.titleOther && (
          <Field label={t.person.titleCustom} required error={errMsg("titleCustom")}>
            <TextInput
              {...register(name("titleCustom"))}
              placeholder={t.person.titleCustomPlaceholder}
              invalid={!!errMsg("titleCustom")}
            />
          </Field>
        )}
      </div>

      {/* Thai name */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.person.firstNameTh} required error={errMsg("firstNameTh")}>
          <TextInput {...register(name("firstNameTh"))} placeholder={t.person.firstNameThPlaceholder} invalid={!!errMsg("firstNameTh")} />
        </Field>
        <Field label={t.person.lastNameTh} required error={errMsg("lastNameTh")}>
          <TextInput {...register(name("lastNameTh"))} placeholder={t.person.lastNameThPlaceholder} invalid={!!errMsg("lastNameTh")} />
        </Field>
      </div>

      {/* English name */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.person.firstNameEn} hint={t.person.firstNameEnHint} error={errMsg("firstNameEn")}>
          <TextInput
            {...register(name("firstNameEn"))}
            placeholder="Somchai"
            autoCapitalize="words"
            invalid={!!errMsg("firstNameEn")}
          />
        </Field>
        <Field label={t.person.lastNameEn} error={errMsg("lastNameEn")}>
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
          label={t.person.hasMiddle}
        />
        {hasMiddle && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={t.person.middleNameTh} required error={errMsg("middleNameTh")}>
              <TextInput {...register(name("middleNameTh"))} invalid={!!errMsg("middleNameTh")} />
            </Field>
            <Field label={t.person.middleNameEn} error={errMsg("middleNameEn")}>
              <TextInput {...register(name("middleNameEn"))} autoCapitalize="words" invalid={!!errMsg("middleNameEn")} />
            </Field>
          </div>
        )}
      </div>

      {/* Phone */}
      <Field label={t.person.phone} required error={errMsg("phone")} hint={t.person.phoneHint}>
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
          // Roomy enough for an iOS-autofilled "+66 81 234 5678"; the schema
          // folds any +66 / spacing back to 0812345678.
          maxLength={20}
          placeholder="0812345678"
          invalid={!!errMsg("phone")}
          disabled={phoneSameAsOwner}
          className={phoneSameAsOwner ? "opacity-60" : undefined}
        />
      </Field>

      {/* Date of birth — ค.ศ. or พ.ศ., auto-detected from the year (no toggle
          needed; see yearToCE()). Grid columns are proportional to digit
          count (dd/mm = 2, yyyy = 4) so the row always fits its container. */}
      <Field
        label={t.person.dob}
        required
        error={errMsg("dob.d") || errMsg("dob.m") || errMsg("dob.y")}
        hint={t.person.dobHint}
      >
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1.6fr] items-center gap-1.5">
          <DobBox
            placeholder={t.person.day}
            maxLength={2}
            maxValue={31}
            reg={register(name("dob.d"))}
            invalid={!!errMsg("dob.d")}
          />
          <span className="text-white/30">/</span>
          <DobBox
            placeholder={t.person.month}
            maxLength={2}
            maxValue={12}
            reg={register(name("dob.m"))}
            invalid={!!errMsg("dob.m")}
          />
          <span className="text-white/30">/</span>
          <DobBox
            placeholder={t.person.year}
            maxLength={4}
            reg={register(name("dob.y"))}
            invalid={!!errMsg("dob.y")}
          />
        </div>
      </Field>

      {/* Go rank — search DB to verify, or self-declare (pending approval) */}
      <RankPicker prefix={prefix} />

      {/* Residence province (searchable) */}
      <Field label={t.person.province} required error={errMsg("province")}>
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
            {ownerProvince || t.person.dash}
          </div>
        ) : (
          <Combobox
            value={province || null}
            onChange={(v) => setValue(name("province"), v, { shouldValidate: true })}
            options={provinceOptions}
            placeholder={t.person.selectProvince}
            searchPlaceholder={t.person.searchProvince}
            emptyText={t.person.noProvince}
            invalid={!!errMsg("province")}
          />
        )}
      </Field>

      {/* Go institute (searchable + create-new) */}
      <Field
        label={t.person.institute}
        required
        error={errMsg("instituteName")}
        hint={t.person.instituteHint}
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
            {ownerInstName || t.person.dash}
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
            placeholder={t.person.selectInstitute}
            searchPlaceholder={t.person.searchInstitute}
            emptyText={t.person.noInstitute}
            invalid={!!errMsg("instituteName")}
            allowCreate
            createLabel={(q) => t.person.addInstitute(q)}
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
            {t.person.pdpaConsent}
            <span className="ml-0.5 text-rose-400">*</span>
          </span>
        </label>
      </Field>

      {/* Category (only when categories provided) */}
      {categories && (
        <Field label={t.person.categoryToRegister} required error={errMsg("categoryId")}>
          <Combobox
            value={(watch(name("categoryId")) as string) ?? ""}
            onChange={(v) =>
              setValue(name("categoryId"), v, { shouldValidate: true })
            }
            options={[
              { value: "", label: t.person.selectCategory },
              ...categories.map((c) => {
                const r = remainingSeats(c);
                return {
                  value: c.id,
                  label: `${c.code} · ${c.name} — ${formatThb(c.feeThb)}฿ ${
                    r === 0 ? t.register.seatsFull : t.register.seatsRemaining(r)
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

/** Segmented toggle between the account owner's saved value and typing a new
 *  one, shown above a field — both states stay visible at once, unlike a
 *  checkbox where "unchecked" only implies the other option. */
function SameAsOwner({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Segmented
      className="w-full whitespace-nowrap"
      value={checked ? "same" : "own"}
      onChange={(v) => onChange(v === "same")}
      options={[
        { value: "same", label: t.person.sameAsOwner },
        { value: "own", label: t.person.fillOwn },
      ]}
    />
  );
}

function DobBox({
  reg,
  placeholder,
  maxLength,
  maxValue,
  invalid,
}: {
  reg: UseFormRegisterReturn;
  placeholder: string;
  maxLength: number;
  /** Largest valid number (e.g. 31 for day, 12 for month). When the typed value
   *  can no longer be extended into a valid number, jump to the next box — so
   *  "9" in the day box advances immediately (no day starts 90–99). */
  maxValue?: number;
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
          // between the date boxes (they aren't <input>s).
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
      className="w-full no-spinner text-center"
      invalid={invalid}
    />
  );
}
