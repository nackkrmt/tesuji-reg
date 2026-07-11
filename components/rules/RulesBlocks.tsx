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
      return (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            {block.hasHeader && block.rows.length > 0 && (
              <thead className="bg-white/[0.04] text-white/50">
                <tr>
                  {block.rows[0].map((cell, ci) => (
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
              {(block.hasHeader ? block.rows.slice(1) : block.rows).map(
                (row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="whitespace-pre-wrap px-3 py-2.5 text-white/80"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      );
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
