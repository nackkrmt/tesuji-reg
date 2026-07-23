"use client";

import { Button } from "@/components/ui/Button";
import { RowAction } from "@/components/ui/RowAction";
import { Segmented, Textarea, TextInput, Toggle } from "@/components/ui/form";
import { RulesTableEditor } from "@/components/admin/rules/RulesTableEditor";
import {
  RULES_BLOCK_LABEL,
  RULES_BLOCK_TYPES,
  type RulesBlock,
} from "@/lib/data/types";
import { emptyBlock } from "@/lib/validation/schemas";

const iconBtn =
  "flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60 outline-none transition hover:bg-white/10 hover:text-white/90 disabled:pointer-events-none disabled:opacity-30 lg:h-8 lg:w-8";

function UpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
function DownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** The full ordered list of content blocks for one กฎ กติกา section: each
 *  block's own editor, reorder/remove chrome, and an "+ เพิ่มบล็อก" menu to
 *  append a new block at the end. */
export function RulesBlockEditor({
  blocks,
  onChange,
}: {
  blocks: RulesBlock[];
  onChange: (blocks: RulesBlock[]) => void;
}) {
  function update(i: number, block: RulesBlock) {
    onChange(blocks.map((b, bi) => (bi === i ? block : b)));
  }
  function remove(i: number) {
    onChange(blocks.filter((_, bi) => bi !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function append(type: RulesBlock["type"]) {
    onChange([...blocks, emptyBlock(type)]);
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <p className="py-2 text-sm text-white/45">
          ยังไม่มีบล็อก — เพิ่มจากเมนูด้านล่าง
        </p>
      ) : (
        <ul className="space-y-2">
          {blocks.map((block, i) => (
            <li
              key={i}
              className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/40">
                  {RULES_BLOCK_LABEL[block.type]}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="เลื่อนบล็อกขึ้น"
                    className={iconBtn}
                  >
                    <UpIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1}
                    aria-label="เลื่อนบล็อกลง"
                    className={iconBtn}
                  >
                    <DownIcon />
                  </button>
                  <RowAction
                    tone="danger"
                    onClick={() => remove(i)}
                    aria-label="ลบบล็อก"
                  >
                    ลบ
                  </RowAction>
                </div>
              </div>
              <BlockFields block={block} onChange={(b) => update(i, b)} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {RULES_BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => append(type)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 outline-none transition hover:bg-white/10 hover:text-white"
          >
            + {RULES_BLOCK_LABEL[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: RulesBlock;
  onChange: (b: RulesBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <TextInput
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="ข้อความหัวข้อย่อย"
        />
      );
    case "paragraph":
      return (
        <Textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="พิมพ์ข้อความ…"
          rows={3}
        />
      );
    case "callout":
      return (
        <div className="space-y-2">
          <Segmented
            options={[
              { value: "info" as const, label: "ข้อมูล" },
              { value: "warn" as const, label: "คำเตือน" },
            ]}
            value={block.tone}
            onChange={(v) => onChange({ ...block, tone: v })}
          />
          <Textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="ข้อความหมายเหตุ"
            rows={2}
          />
        </div>
      );
    case "divider":
      return (
        <p className="text-xs text-white/40">
          เส้นคั่นระหว่างเนื้อหา — ไม่มีข้อมูลให้กรอก
        </p>
      );
    case "list":
      return <ListEditor block={block} onChange={onChange} />;
    case "table":
      return <RulesTableEditor value={block} onChange={onChange} />;
  }
}

function ListEditor({
  block,
  onChange,
}: {
  block: Extract<RulesBlock, { type: "list" }>;
  onChange: (b: RulesBlock) => void;
}) {
  function setItem(i: number, patch: Partial<{ text: string; depth: number }>) {
    onChange({
      ...block,
      items: block.items.map((it, ii) => (ii === i ? { ...it, ...patch } : it)),
    });
  }
  function addItem() {
    onChange({ ...block, items: [...block.items, { text: "", depth: 0 }] });
  }
  function removeItem(i: number) {
    if (block.items.length <= 1) return;
    onChange({ ...block, items: block.items.filter((_, ii) => ii !== i) });
  }

  return (
    <div className="space-y-2">
      <Toggle
        checked={block.ordered}
        onChange={(v) => onChange({ ...block, ordered: v })}
        label="ลำดับเลข (1. 2. 3.)"
      />
      <ul className="space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <select
              value={item.depth}
              onChange={(e) => setItem(i, { depth: Number(e.target.value) })}
              aria-label="ระดับย่อหน้า"
              className="h-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 text-xs text-white/70 outline-none"
            >
              {Array.from({ length: 7 }).map((_, d) => (
                <option key={d} value={d}>
                  ชั้น {d}
                </option>
              ))}
            </select>
            <input
              value={item.text}
              onChange={(e) => setItem(i, { text: e.target.value })}
              placeholder="ข้อความ"
              className="h-9 flex-1 rounded-lg bg-white/[0.04] px-2.5 text-sm text-white outline-none focus:bg-white/[0.08]"
            />
            <RowAction
              tone="danger"
              onClick={() => removeItem(i)}
              disabled={block.items.length <= 1}
              aria-label="ลบข้อ"
            >
              <XIcon />
            </RowAction>
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={addItem}>
        + ข้อ
      </Button>
    </div>
  );
}
