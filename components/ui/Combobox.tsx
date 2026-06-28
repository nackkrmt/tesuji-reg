"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DropdownPanel } from "./DropdownPanel";

const control =
  "w-full rounded-2xl glass-input px-3.5 py-3 text-white outline-none disabled:opacity-50";

export interface ComboOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** A single-select dropdown sharing the unified `.dropdown-panel` surface.
 *  Shows a search box for long lists; optionally lets the user create a new
 *  entry from the typed query (used by the institute picker). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "— เลือก —",
  searchPlaceholder = "ค้นหา…",
  emptyText = "ไม่พบรายการ",
  invalid,
  disabled,
  searchable,
  compact = false,
  className,
  panelClassName,
  allowCreate = false,
  onCreate,
  createLabel,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Show the search box. Defaults to true for long lists (> 6 options). */
  searchable?: boolean;
  /** Compact trigger (smaller padding, not full-width) — set width via className. */
  compact?: boolean;
  /** Extra classes for the trigger button (e.g. a fixed width). */
  className?: string;
  /** Extra classes for the floating panel (e.g. a fixed width in compact mode). */
  panelClassName?: string;
  allowCreate?: boolean;
  /** Called with the trimmed query when the user taps "create". */
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const hasExact = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length === 0 || options.some((o) => o.label.trim().toLowerCase() === q);
  }, [options, query]);

  const showCreate = allowCreate && !!onCreate && query.trim().length > 0 && !hasExact;

  // Search box appears for long lists, or whenever creating a new entry is allowed.
  const showSearch = (searchable ?? options.length > 6) || allowCreate;

  // Reset + focus the search box each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  async function create() {
    if (!onCreate) return;
    const q = query.trim();
    if (!q) return;
    setCreating(true);
    try {
      await onCreate(q);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          compact
            ? "rounded-lg glass-input px-2 py-2.5 text-sm text-white outline-none disabled:opacity-50"
            : control,
          "flex items-center justify-between gap-1.5 text-left",
          invalid && "border-rose-400/70 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.3)]",
          className,
        )}
      >
        <span className={cn("truncate", !selected && "text-white/35")}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={cn(compact ? "h-4 w-4" : "h-5 w-5", "shrink-0 text-white/40")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DropdownPanel
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        matchWidth={!compact}
        className={panelClassName}
      >
        {showSearch && (
          <div className="border-b border-white/10 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-brand-400/70 focus:bg-white/10"
            />
          </div>
        )}
        <ul className="max-h-60 overflow-auto py-1">
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  disabled={o.disabled}
                  onClick={() => !o.disabled && pick(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition",
                    o.disabled
                      ? "cursor-not-allowed text-white/25"
                      : o.value === value
                        ? "font-semibold text-brand-300 hover:bg-white/10"
                        : "text-white/80 hover:bg-white/10",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg className="h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !showCreate && (
              <li className="px-3.5 py-3 text-sm text-white/40">{emptyText}</li>
            )}
            {showCreate && (
              <li className="border-t border-white/10">
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-sm font-semibold text-brand-300 transition hover:bg-brand-500/10 disabled:opacity-50"
                >
                  {creating
                    ? "กำลังเพิ่ม…"
                    : createLabel
                      ? createLabel(query.trim())
                      : `+ เพิ่ม “${query.trim()}”`}
                </button>
              </li>
            )}
        </ul>
      </DropdownPanel>
    </>
  );
}
