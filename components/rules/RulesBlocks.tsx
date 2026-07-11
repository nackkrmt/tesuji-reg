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

/** A table block. On phones a wide table (many columns) is unreadable as a
 *  horizontal-scroll grid, so — like CategoryTable — it renders as a real
 *  table from `sm` up and collapses each row into a stacked label→value card
 *  below `sm`. Narrow tables (≤3 cols) stay a plain table at every size. */
function RulesTable({ block }: { block: TableBlock }) {
  const { hasHeader, rows } = block;
  if (rows.length === 0) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  const header = hasHeader ? rows[0] : null;
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const stackOnMobile = header !== null && cols >= 4;

  const grid = (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        {header && (
          <thead className="bg-white/[0.04] text-white/50">
            <tr>
              {header.map((cell, ci) => (
                <th
                  key={ci}
                  className="whitespace-nowrap px-3 py-2.5 text-left font-medium"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-white/5">
          {bodyRows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="whitespace-pre-wrap px-3 py-2.5 align-top text-white/80"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!stackOnMobile) return grid;

  return (
    <>
      <div className="hidden sm:block">{grid}</div>
      <div className="space-y-2.5 sm:hidden">
        {bodyRows.map((row, ri) => (
          <div
            key={ri}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
          >
            {row[0] && (
              <div className="mb-2.5 border-b border-white/10 pb-2 text-sm font-bold text-brand-200">
                {header?.[0] && (
                  <span className="font-medium text-white/40">{header[0]} </span>
                )}
                {row[0]}
              </div>
            )}
            <dl className="space-y-2">
              {row.slice(1).map((cell, i) => {
                if (!cell.trim()) return null;
                const label = header?.[i + 1] ?? "";
                // Short values sit inline (label left · value right) to keep the
                // card compact; long / multi-line values stack under their label.
                const short = !cell.includes("\n") && cell.length <= 16;
                return short ? (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-sm text-white/45">{label}</dt>
                    <dd className="text-right text-sm text-white/85">{cell}</dd>
                  </div>
                ) : (
                  <div key={i}>
                    <dt className="text-xs font-medium text-white/40">{label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-white/85">
                      {cell}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
