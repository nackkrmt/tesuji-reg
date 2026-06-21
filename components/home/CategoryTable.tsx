"use client";

import { Category, remainingSeats } from "@/lib/data/types";
import { bandLabel } from "@/lib/rank";
import { ageBandLabel } from "@/lib/age";
import { formatThb } from "@/lib/utils";
import { cn } from "@/lib/utils";

function RemainingBadge({ c }: { c: Category }) {
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
      {r === 0 ? "เต็ม" : r}
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

export function CategoryTable({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/40">
        ยังไม่มีรุ่นที่เปิดรับสมัคร
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
              <th className="px-3 py-2.5 text-left font-medium">รหัส</th>
              <th className="px-3 py-2.5 text-left font-medium">ชื่อรุ่น</th>
              <th className="px-3 py-2.5 text-left font-medium">ระดับฝีมือ</th>
              <th className="px-3 py-2.5 text-center font-medium">เปิดรับ</th>
              <th className="px-3 py-2.5 text-center font-medium">เหลือ</th>
              <th className="px-3 py-2.5 text-right font-medium">ค่าสมัคร</th>
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
                  {bandLabel(c.minPowerLevel, c.maxPowerLevel)}
                  {ageBandLabel(c.minAge, c.maxAge) && (
                    <span className="mt-0.5 block text-xs text-white/40">
                      {ageBandLabel(c.minAge, c.maxAge)}
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

      {/* Mobile: cards */}
      <div className="space-y-2.5 sm:hidden">
        {categories.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CodeChip code={c.code} />
                <p className="font-semibold text-white/90">{c.name}</p>
              </div>
              <RemainingBadge c={c} />
            </div>
            <p className="mt-1.5 text-sm text-white/55">
              {bandLabel(c.minPowerLevel, c.maxPowerLevel)}
            </p>
            {ageBandLabel(c.minAge, c.maxAge) && (
              <p className="text-xs text-white/40">
                {ageBandLabel(c.minAge, c.maxAge)}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-white/40">เปิดรับ {c.capacity} ที่</span>
              <span className="font-semibold text-white/90">
                {formatThb(c.feeThb)} บาท
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
