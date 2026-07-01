"use client";

import { Category, remainingSeats } from "@/lib/data/types";
import { bandLabel } from "@/lib/rank";
import { ageBandLabel } from "@/lib/age";
import { formatThb } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function RemainingBadge({ c }: { c: Category }) {
  const { t } = useI18n();
  const r = remainingSeats(c);
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.5rem] justify-center rounded-lg px-2 py-0.5 text-sm font-semibold ring-1 ring-inset",
        r === 0
          ? "bg-rose-400/15 text-rose-300 ring-rose-400/25"
          : r <= 3
            ? "bg-amber-400/15 text-amber-300 ring-amber-400/25"
            : "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25",
      )}
    >
      {r === 0 ? t.category.full : r}
    </span>
  );
}

function CodeChip({ code }: { code: string }) {
  return (
    <span className="rounded-lg bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-200 ring-1 ring-inset ring-brand-400/25">
      {code}
    </span>
  );
}

/** Glanceable availability word for the mobile card header. */
function StatusPill({ c }: { c: Category }) {
  const { t } = useI18n();
  const r = remainingSeats(c);
  const { label, cls } =
    r === 0
      ? { label: t.category.fullStatus, cls: "bg-rose-400/15 text-rose-300 ring-rose-400/25" }
      : r <= 3
        ? {
            label: t.category.almostFull,
            cls: "bg-amber-400/15 text-amber-300 ring-amber-400/25",
          }
        : {
            label: t.category.open,
            cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25",
          };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        cls,
      )}
    >
      {label}
    </span>
  );
}

/** One labelled spec line: icon · label (muted) · value (right-aligned). */
function SpecRow({
  icon,
  label,
  value,
  strong,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/55 ring-1 ring-inset ring-white/10">
        {icon}
      </span>
      <span className="text-sm text-white/45">{label}</span>
      <span
        className={cn(
          "ml-auto text-right text-sm",
          strong ? "font-semibold text-white" : "font-medium text-white/85",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Seats remaining shown as remaining/total with a fill bar coloured by status. */
function SeatMeter({ c }: { c: Category }) {
  const { t } = useI18n();
  const remaining = remainingSeats(c);
  const total = Math.max(0, c.capacity);
  const taken = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, Math.round((taken / total) * 100)) : 100;
  const full = remaining === 0;
  const low = remaining > 0 && remaining <= 3;
  const fill = full
    ? "bg-rose-400/80"
    : low
      ? "bg-amber-400/80"
      : "bg-emerald-400/80";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-white/45">{t.category.seatsLeft}</span>
        {full ? (
          <span className="text-sm font-semibold text-rose-300">{t.category.fullStatus}</span>
        ) : (
          <span className="text-sm text-white/85">
            <span
              className={cn(
                "text-base font-bold",
                low ? "text-amber-300" : "text-emerald-300",
              )}
            >
              {remaining}
            </span>
            <span className="text-white/45">{t.category.ofSeats(total)}</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CategoryTable({ categories }: { categories: Category[] }) {
  const { t, locale } = useI18n();
  if (categories.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/40">
        {t.category.emptyList}
      </p>
    );
  }

  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 sm:block">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-white/50">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">{t.category.colCode}</th>
              <th className="px-3 py-2.5 text-left font-medium">{t.category.colName}</th>
              <th className="px-3 py-2.5 text-left font-medium">{t.category.colLevel}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t.category.colCapacity}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t.category.colRemaining}</th>
              <th className="px-3 py-2.5 text-right font-medium">{t.category.colFee}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {categories.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-white/[0.03]">
                <td className="px-3 py-3">
                  <CodeChip code={c.code} />
                </td>
                <td className="px-3 py-3 font-medium text-white/90">{c.name}</td>
                <td className="px-3 py-3 text-white/55">
                  {bandLabel(c.minPowerLevel, c.maxPowerLevel, locale)}
                  {ageBandLabel(c.minAge, c.maxAge, locale) && (
                    <span className="mt-0.5 block text-xs text-white/40">
                      {ageBandLabel(c.minAge, c.maxAge, locale)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-white/70">
                  {c.capacity}
                </td>
                <td className="px-3 py-3 text-center">
                  <RemainingBadge c={c} />
                </td>
                <td className="px-3 py-3 text-right font-medium text-white/90">
                  {formatThb(c.feeThb)} ฿
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards — every value carries a label + icon */}
      <div className="space-y-3 sm:hidden">
        {categories.map((c) => {
          const age = ageBandLabel(c.minAge, c.maxAge, locale);
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              {/* header: code + name + status word */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CodeChip code={c.code} />
                  <p className="truncate font-semibold text-white/95">
                    {c.name}
                  </p>
                </div>
                <StatusPill c={c} />
              </div>

              {/* labelled specs */}
              <div className="mt-3 space-y-2">
                <SpecRow
                  icon={<IconRank />}
                  label={t.category.colLevel}
                  value={bandLabel(c.minPowerLevel, c.maxPowerLevel, locale)}
                />
                {age && <SpecRow icon={<IconAge />} label={t.category.age} value={age} />}
                <SpecRow
                  icon={<IconCoin />}
                  label={t.category.colFee}
                  value={`${formatThb(c.feeThb)} ${t.common.baht}`}
                  strong
                />
              </div>

              {/* seats */}
              <div className="mt-3 border-t border-white/[0.07] pt-3">
                <SeatMeter c={c} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* --- inline icons (stroke = currentColor, matches home meta rows) --- */
function IconRank() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5L7.5 21l4.5-2.5L16.5 21 15 13.5" />
    </svg>
  );
}
function IconAge() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconCoin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M9.5 9.5h3.2a1.8 1.8 0 010 3.6H10" />
    </svg>
  );
}
