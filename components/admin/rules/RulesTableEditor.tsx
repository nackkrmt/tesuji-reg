"use client";

import { Button } from "@/components/ui/Button";
import { RowAction } from "@/components/ui/RowAction";
import { Toggle } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { RulesBlock } from "@/lib/data/types";

type TableBlock = Extract<RulesBlock, { type: "table" }>;

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Editable grid for a "table" block: text cell inputs, add/remove row &
 *  column, and a header-row toggle. Always keeps at least 1 row × 1 col. */
export function RulesTableEditor({
  value,
  onChange,
}: {
  value: TableBlock;
  onChange: (v: TableBlock) => void;
}) {
  const cols = value.rows[0]?.length ?? 0;

  function setCell(ri: number, ci: number, text: string) {
    onChange({
      ...value,
      rows: value.rows.map((row, i) =>
        i === ri ? row.map((c, j) => (j === ci ? text : c)) : row,
      ),
    });
  }

  function addRow() {
    onChange({ ...value, rows: [...value.rows, Array(cols).fill("")] });
  }
  function removeRow(ri: number) {
    if (value.rows.length <= 1) return;
    onChange({ ...value, rows: value.rows.filter((_, i) => i !== ri) });
  }
  function addCol() {
    onChange({ ...value, rows: value.rows.map((row) => [...row, ""]) });
  }
  function removeCol(ci: number) {
    if (cols <= 1) return;
    onChange({
      ...value,
      rows: value.rows.map((row) => row.filter((_, j) => j !== ci)),
    });
  }

  return (
    <div className="space-y-3">
      <Toggle
        checked={value.hasHeader}
        onChange={(v) => onChange({ ...value, hasHeader: v })}
        label="แถวหัวตาราง"
      />
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="border-collapse text-sm">
          <tbody>
            {value.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-white/10 p-1">
                    <input
                      value={cell}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      placeholder={ri === 0 && value.hasHeader ? "หัวคอลัมน์" : ""}
                      className={cn(
                        "w-full min-w-[7rem] rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-white placeholder:text-white/25 outline-none focus:bg-white/[0.08]",
                        ri === 0 && value.hasHeader && "font-semibold",
                      )}
                    />
                  </td>
                ))}
                <td className="border-none p-1">
                  <RowAction
                    tone="danger"
                    onClick={() => removeRow(ri)}
                    disabled={value.rows.length <= 1}
                    aria-label="ลบแถว"
                    className="px-2"
                  >
                    <XIcon />
                  </RowAction>
                </td>
              </tr>
            ))}
            <tr>
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci} className="border-none p-1 text-center">
                  <RowAction
                    tone="danger"
                    onClick={() => removeCol(ci)}
                    disabled={cols <= 1}
                    aria-label="ลบคอลัมน์"
                    className="w-full justify-center px-2"
                  >
                    <XIcon />
                    <span>คอลัมน์นี้</span>
                  </RowAction>
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          + แถว
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={addCol}>
          + คอลัมน์
        </Button>
      </div>
    </div>
  );
}
