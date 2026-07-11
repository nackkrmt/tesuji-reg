"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { RulesBlock } from "@/lib/data/types";

/** Renders one กฎ กติกา section's content blocks, authored verbatim in the
 *  admin block editor — no text-convention parsing at render time. */
export function RulesBlocks({ blocks }: { blocks: RulesBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <RulesBlockView key={i} block={block} />
      ))}
    </div>
  );
}

function RulesBlockView({ block }: { block: RulesBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h3 className="text-sm font-semibold text-white">{block.text}</h3>
      );
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
          {block.text}
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="space-y-1 text-sm leading-relaxed text-white/80">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2"
              style={{ paddingLeft: `${item.depth}rem` }}
            >
              <span className="shrink-0 text-white/45">
                {block.ordered ? `${i + 1}.` : "•"}
              </span>
              <span className="whitespace-pre-wrap">{item.text}</span>
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return <RulesTable block={block} />;
    case "divider":
      return <hr className="border-white/10" />;
    case "callout":
      return (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm leading-relaxed",
            block.tone === "warn"
              ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
              : "border-brand-400/25 bg-brand-400/10 text-brand-100",
          )}
        >
          {block.text}
        </div>
      );
  }
}

type TableBlock = Extract<RulesBlock, { type: "table" }>;

// Solid panel colours so the frozen first column is fully opaque (base bg is
// #060912) — content must never show through as it scrolls underneath.
const TABLE_BG = "bg-[#0b1120]";
const TABLE_HEAD_BG = "bg-[#141c2e]";

/** A table block rendered as a compact, horizontally-scrollable table whose
 *  first column stays pinned while the rest scrolls. This keeps a wide
 *  comparison table (many รุ่น / prize columns) readable on a narrow phone —
 *  you never lose the row's identity — without the endless vertical scroll of
 *  a per-row card layout. Cells wrap so no single column grows unbounded. */
function RulesTable({ block }: { block: TableBlock }) {
  const { hasHeader, rows } = block;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  if (rows.length === 0) return null;
  const header = hasHeader ? rows[0] : null;
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const sticky = "sticky left-0 whitespace-nowrap border-r border-white/10";

  return (
    <div>
      <div
        ref={scrollRef}
        className={cn(
          "overflow-x-auto rounded-2xl border border-white/10",
          TABLE_BG,
        )}
      >
        <table className="min-w-full border-separate border-spacing-0 text-xs sm:text-sm">
          {header && (
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className={cn(
                      "border-b border-white/10 px-2.5 py-2 text-left align-bottom font-medium text-white/55",
                      TABLE_HEAD_BG,
                      ci === 0 ? cn(sticky, "z-20") : "whitespace-nowrap",
                    )}
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-2.5 py-2 align-top",
                      ri > 0 && "border-t border-white/5",
                      ci === 0
                        ? cn(sticky, TABLE_BG, "z-10 font-medium text-white/90")
                        : "max-w-[11rem] whitespace-pre-wrap text-white/75",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflowing && (
        <p className="mt-1.5 px-1 text-xs text-white/35">
          ← เลื่อนตารางเพื่อดูข้อมูลเพิ่ม →
        </p>
      )}
    </div>
  );
}
