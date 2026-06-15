"use client";

import { Category, remainingSeats } from "@/lib/data/types";
import { formatThb } from "@/lib/utils";
import { cn } from "@/lib/utils";

function RemainingBadge({ c }: { c: Category }) {
  const r = remainingSeats(c);
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.5rem] justify-center rounded-md px-2 py-0.5 text-sm font-semibold",
        r === 0
          ? "bg-rose-100 text-rose-700"
          : r <= 3
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700",
      )}
    >
      {r === 0 ? "เต็ม" : r}
    </span>
  );
}

export function CategoryTable({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        ยังไม่มีรุ่นที่เปิดรับสมัคร
      </p>
    );
  }

  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">รหัส</th>
              <th className="px-3 py-2.5 text-left font-medium">ชื่อรุ่น</th>
              <th className="px-3 py-2.5 text-left font-medium">ระดับฝีมือ</th>
              <th className="px-3 py-2.5 text-center font-medium">เปิดรับ</th>
              <th className="px-3 py-2.5 text-center font-medium">เหลือ</th>
              <th className="px-3 py-2.5 text-right font-medium">ค่าสมัคร</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-3">
                  <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                    {c.code}
                  </span>
                </td>
                <td className="px-3 py-3 font-medium text-slate-800">{c.name}</td>
                <td className="px-3 py-3 text-slate-500">{c.skillLevel}</td>
                <td className="px-3 py-3 text-center text-slate-600">
                  {c.capacity}
                </td>
                <td className="px-3 py-3 text-center">
                  <RemainingBadge c={c} />
                </td>
                <td className="px-3 py-3 text-right font-medium text-slate-800">
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
            className="rounded-xl border border-slate-200 bg-white p-3.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                  {c.code}
                </span>
                <p className="font-semibold text-slate-800">{c.name}</p>
              </div>
              <RemainingBadge c={c} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{c.skillLevel}</p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-400">
                เปิดรับ {c.capacity} ที่
              </span>
              <span className="font-semibold text-slate-800">
                {formatThb(c.feeThb)} บาท
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
