"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Category,
  PreviewDivisionChangeResult,
  RegistrationBatch,
  RegistrationSeat,
  remainingSeats,
  RequestDivisionChangeResult,
} from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { eligibleFor } from "@/components/registrations/SwapSeatSheet";
import { PromptPayQR } from "@/components/register/PromptPayQR";
import { SlipUploader } from "@/components/register/SlipUploader";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/form";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThb, fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type PreviewOk = Extract<PreviewDivisionChangeResult, { ok: true }>;

/** Change one seat's division (same person). The server preview supplies the
 *  authoritative promo-aware difference: same net cost moves instantly, an
 *  upgrade collects the difference via QR + slip into a pending admin request,
 *  a downgrade collects refund bank details into a pending admin request. The
 *  seat only moves at admin approval for the money-moving paths. */
export function ChangeDivisionSheet({
  open,
  onClose,
  seat,
  tournamentId,
  batch,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  seat: RegistrationSeat;
  tournamentId: string;
  batch: RegistrationBatch;
  onDone: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const { t } = useI18n();

  const { data: categories } = useLiveQuery(
    (d) => d.listCategories(tournamentId),
    [tournamentId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [checking, setChecking] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);
  const [originalQr, setOriginalQr] = useState<string | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // reset each time the sheet opens for a (possibly different) seat
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setPreview(null);
      setChecking(false);
      setPayload(null);
      setOriginalQr(null);
      setSlip(null);
      setBankName("");
      setBankAccountNo("");
      setBankAccountName("");
      setSubmitting(false);
    }
  }, [open, seat.id]);

  const currentCat = categories?.find((c) => c.id === seat.categoryId);

  // Divisions the CURRENT occupant may take: eligible + has room. Deltas shown
  // in the list are raw fee differences (estimates under a promo); the preview
  // RPC supplies the authoritative amount once a division is picked.
  const options = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter(
        (c) =>
          c.id !== seat.categoryId &&
          eligibleFor(seat, c) &&
          remainingSeats(c) > 0,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, seat]);

  const hasDiscount = (batch.discountThb ?? 0) > 0;

  function showChangeError(
    res:
      | Exclude<PreviewDivisionChangeResult, { ok: true }>
      | Exclude<RequestDivisionChangeResult, { ok: true }>,
  ) {
    switch (res.error) {
      case "INSUFFICIENT_SEATS":
        toast.show(
          t.register.errInsufficientSeats(
            res.categoryName,
            res.remaining,
            res.requested,
          ),
          "error",
        );
        break;
      case "RANK_NOT_ELIGIBLE":
        toast.show(
          t.register.errRankNotEligible(res.personLabel, res.categoryName),
          "error",
        );
        break;
      case "RANK_REQUIRED":
        toast.show(t.register.errRankRequired(res.personLabel), "error");
        break;
      case "AGE_NOT_ELIGIBLE":
        toast.show(
          t.register.errAgeNotEligible(res.personLabel, res.age, res.categoryName),
          "error",
        );
        break;
      case "COMBINATION_NOT_ALLOWED":
        toast.show(
          t.register.errCombinationNotAllowed(
            res.personLabel,
            res.categoryName,
            res.otherCategoryName,
          ),
          "error",
        );
        break;
      case "DUPLICATE_REGISTRATION":
        toast.show(
          t.register.errDuplicate(
            res.personLabel,
            res.categoryName,
            res.referenceCode ?? null,
          ),
          "error",
        );
        break;
      case "AWARD_LIMIT_REACHED":
        toast.show(
          t.register.errAwardLimitReached(res.personLabel, res.awardCount),
          "error",
        );
        break;
      case "PENDING_EXISTS":
        toast.show(t.divChange.errPending, "error");
        break;
      case "NO_CHANGE":
        toast.show(t.divChange.errNoChange, "error");
        break;
      case "SWAP_CLOSED":
        toast.show(t.divChange.errClosed, "error");
        break;
      case "ALREADY_WITHDRAWN":
        toast.show(t.divChange.errAlready, "error");
        break;
      case "SLIP_REQUIRED":
        toast.show(t.divChange.errSlipRequired, "error");
        break;
      case "INVALID_FIELD":
        toast.show(t.withdraw.errAccountNo, "error");
        break;
      default:
        toast.show(t.divChange.errGeneric, "error");
    }
  }

  // picking a division asks the server for the authoritative amount + early
  // validation (before the player transfers any money)
  async function onSelect(catId: string) {
    if (checking || submitting) return;
    setSelectedId(catId);
    setPreview(null);
    setPayload(null);
    setOriginalQr(null);
    setSlip(null);
    setChecking(true);
    try {
      const res = await dl.previewDivisionChange(seat.id, catId);
      if (!res.ok) {
        showChangeError(res);
        setSelectedId(null);
        return;
      }
      setPreview(res);
      if (res.direction === "upgrade") {
        try {
          const p = await dl.buildPromptPayPayload(tournamentId, res.amountThb);
          setPayload(p.payload);
          setOriginalQr(p.original);
        } catch {
          // QR unavailable (e.g. no merchant QR configured) — the amount is
          // still shown; the player can transfer manually
          setPayload(null);
          setOriginalQr(null);
        }
      }
    } catch {
      toast.show(t.divChange.errGeneric, "error");
      setSelectedId(null);
    } finally {
      setChecking(false);
    }
  }

  async function onConfirm() {
    if (!preview) return;
    if (preview.direction === "upgrade" && !slip) {
      toast.show(t.divChange.errSlipRequired, "error");
      return;
    }
    if (preview.direction === "downgrade") {
      if (!bankName.trim() || !bankAccountNo.trim() || !bankAccountName.trim()) {
        toast.show(t.withdraw.errRequired, "error");
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await dl.requestDivisionChange({
        seatId: seat.id,
        categoryId: preview.categoryId,
        slip: preview.direction === "upgrade" ? slip : null,
        bankName: preview.direction === "downgrade" ? bankName.trim() : null,
        bankAccountNo:
          preview.direction === "downgrade" ? bankAccountNo.trim() : null,
        bankAccountName:
          preview.direction === "downgrade" ? bankAccountName.trim() : null,
      });
      if (res.ok) {
        toast.show(
          "moved" in res
            ? t.divChange.successMoved
            : res.direction === "upgrade"
              ? t.divChange.successPendingUpgrade
              : t.divChange.successPendingDowngrade,
          "success",
        );
        onDone();
        onClose();
        return;
      }
      showChangeError(res);
    } catch {
      toast.show(t.divChange.errGeneric, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const loading = !categories;
  const confirmLabel =
    preview?.direction === "upgrade"
      ? t.divChange.confirmUpgrade
      : preview?.direction === "downgrade"
        ? t.divChange.confirmDowngrade
        : t.divChange.confirmEven;
  const confirmDisabled =
    loading ||
    checking ||
    !preview ||
    (preview.direction === "upgrade" && !slip);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.divChange.title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t.swap.cancel}
          </Button>
          <Button
            fullWidth
            onClick={onConfirm}
            loading={submitting}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {loading ? (
        <CenterLoader />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-white/55">{t.divChange.intro}</p>

          {/* who / current division / fee */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-semibold text-white/90">{fullNameTh(seat)}</p>
            <p className="mt-0.5 text-sm text-brand-300">
              {t.divChange.currentDivision}:{" "}
              {currentCat
                ? `${currentCat.code} · ${currentCat.name}`
                : t.person.dash}
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              {t.divChange.feeLine(formatThb(seat.feeThbSnapshot))}
            </p>
          </div>

          {hasDiscount && (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-3 py-2.5 text-xs leading-relaxed text-sky-200">
              {t.divChange.deltaEstimateNote}
            </div>
          )}

          {/* division picker */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/80">
              {t.divChange.pickDivision}
            </p>
            {options.length === 0 ? (
              <p className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                {t.divChange.noEligible}
              </p>
            ) : (
              options.map((c) => (
                <DivisionOption
                  key={c.id}
                  category={c}
                  deltaThb={c.feeThb - seat.feeThbSnapshot}
                  checked={selectedId === c.id}
                  onSelect={() => onSelect(c.id)}
                />
              ))
            )}
          </div>

          {checking && (
            <p className="text-center text-sm text-white/45">
              {t.divChange.checking}
            </p>
          )}

          {/* direction-specific settlement UI */}
          {preview?.direction === "even" && (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-sm leading-relaxed text-emerald-200">
              {t.divChange.evenNote}
            </div>
          )}

          {preview?.direction === "upgrade" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white/80">
                {t.divChange.payHeading(formatThb(preview.amountThb))}
              </p>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/55">
                {t.divChange.payNote}
              </div>
              {payload && (
                <PromptPayQR
                  payload={payload}
                  amount={preview.amountThb}
                  fallbackQr={originalQr}
                />
              )}
              <Field label={t.divChange.slipLabel} required>
                <SlipUploader value={slip} onChange={setSlip} />
              </Field>
            </div>
          )}

          {preview?.direction === "downgrade" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white/80">
                {t.divChange.refundHeading(formatThb(preview.amountThb))}
              </p>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/55">
                {t.divChange.refundNote}
              </div>
              <Field label={t.withdraw.bankName} htmlFor="dc-bank" required>
                <TextInput
                  id="dc-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder={t.withdraw.bankNamePlaceholder}
                  maxLength={100}
                />
              </Field>
              <Field label={t.withdraw.accountNo} htmlFor="dc-acctno" required>
                <TextInput
                  id="dc-acctno"
                  inputMode="numeric"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder={t.withdraw.accountNoPlaceholder}
                  maxLength={30}
                />
              </Field>
              <Field
                label={t.withdraw.accountName}
                htmlFor="dc-acctname"
                required
              >
                <TextInput
                  id="dc-acctname"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder={t.withdraw.accountNamePlaceholder}
                  maxLength={100}
                />
              </Field>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function DivisionOption({
  category,
  deltaThb,
  checked,
  onSelect,
}: {
  category: Category;
  deltaThb: number;
  checked: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const delta =
    deltaThb > 0
      ? { label: t.divChange.deltaMore(formatThb(deltaThb)), cls: "bg-amber-500/15 text-amber-300" }
      : deltaThb < 0
        ? { label: t.divChange.deltaLess(formatThb(-deltaThb)), cls: "bg-emerald-500/15 text-emerald-300" }
        : { label: t.divChange.deltaSame, cls: "bg-white/10 text-white/60" };
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition",
        checked
          ? "border-brand-400/60 bg-brand-500/10 ring-2 ring-brand-500/30"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-white/90">
          {category.code} · {category.name}
        </p>
        <p className="mt-0.5 text-sm text-white/45">
          {t.divChange.feeLine(formatThb(category.feeThb))}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-lg px-2 py-1 text-xs font-bold",
          delta.cls,
        )}
      >
        {delta.label}
      </span>
    </button>
  );
}
