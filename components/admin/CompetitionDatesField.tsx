"use client";

import { useId, useRef, useState } from "react";
import {
  formatCompetitionDates,
  isoDay,
  nextDay,
  normalizeCompetitionDates,
} from "@/lib/competition-dates";
import { formatThaiDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/form";
import { IconX } from "@/components/icons";

// No tournament is held before 2000 or after 2100, and a browser date box
// happily takes year 0202 — which is what a slip on the year digits produces.
const MIN_DAY = "2000-01-01";
const MAX_DAY = "2100-12-31";

/** วันที่แข่งขัน as a list, because an event is not always one day: two or
 *  three in a row, or a season of ten Saturdays with weeks between them.
 *
 *  Pick a day, then เพิ่มวัน (or Enter). Leaving the box also adds what is in
 *  it: a day picked and never "added" is the one way to lose a day, and it is
 *  exactly what happens when someone picks the date and reaches for บันทึก.
 *  วันถัดไป appends the day after the last one, so a three-day event is three
 *  taps. The list is always shown sorted, with the text the public pages will
 *  print beneath it.
 *
 *  Controlled, so it serves react-hook-form (watch/setValue) in the tournament
 *  form and plain useState in the clone sheet alike. */
export function CompetitionDatesField({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const days = normalizeCompetitionDates(value);
  // The blur that adds a day and the click that removes another can land in
  // the same gesture (pick a day, then tap × on a chip): the click's closure
  // may predate the add, so every edit starts from the last list committed,
  // not from the one this render was given.
  const latest = useRef(days);
  latest.current = days;

  function commit(next: string[]) {
    latest.current = next;
    onChange(next);
  }

  /** Add one day; false when the text is not a day yet (an unfinished entry). */
  function add(raw: string): boolean {
    const day = isoDay(raw);
    if (!day) return false;
    if (day < MIN_DAY || day > MAX_DAY) {
      setNote("ปีไม่ถูกต้อง — ตรวจตัวเลขปีอีกครั้ง");
      return false;
    }
    setDraft("");
    if (latest.current.includes(day)) {
      setNote(`${formatThaiDate(day)} อยู่ในรายการแล้ว`);
      return true;
    }
    setNote(null);
    commit(normalizeCompetitionDates([...latest.current, day]));
    return true;
  }

  function remove(day: string) {
    setNote(null);
    commit(latest.current.filter((d) => d !== day));
  }

  return (
    <Field
      label="วันที่แข่งขัน"
      htmlFor={inputId}
      required
      error={error}
      hint="เพิ่มได้หลายวัน วันไม่ต้องติดกันก็ได้ — ระบบเรียงลำดับให้เอง"
    >
      <div className="space-y-2">
        {days.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="วันที่แข่งขันที่เลือกไว้">
            {days.map((day) => (
              <li
                key={day}
                className="inline-flex h-10 items-center gap-0.5 rounded-full bg-brand-500/15 pl-3.5 pr-1 text-sm font-semibold text-brand-200 ring-1 ring-inset ring-brand-400/25"
              >
                {formatThaiDate(day)}
                <button
                  type="button"
                  onClick={() => remove(day)}
                  aria-label={`ลบ ${formatThaiDate(day)}`}
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-brand-200/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <IconX size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <TextInput
            id={inputId}
            type="date"
            min={MIN_DAY}
            max={MAX_DAY}
            value={draft}
            invalid={!!error}
            onChange={(e) => {
              setDraft(e.target.value);
              setNote(null);
            }}
            onBlur={() => add(draft)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter adds the day; the form's submit is the sticky บันทึก.
              e.preventDefault();
              add(draft);
            }}
            className="min-w-[11rem] flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => add(draft)}
            disabled={!draft}
          >
            + เพิ่มวัน
          </Button>
          {days.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => add(nextDay(latest.current[latest.current.length - 1]))}
            >
              + วันถัดไป
            </Button>
          )}
        </div>
        {note && <p className="text-xs text-amber-200">{note}</p>}
        {days.length > 0 && (
          <p className="text-xs text-ink-tertiary">
            แสดงบนหน้าเว็บเป็น “{formatCompetitionDates(days)}” · {days.length} วัน
          </p>
        )}
      </div>
    </Field>
  );
}
